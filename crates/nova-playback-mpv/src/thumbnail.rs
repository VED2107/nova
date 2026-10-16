//! Poster-frame extraction with a short-lived, isolated libmpv instance.
//!
//! Uses mpv's `image` video output to write exactly one decoded frame as JPEG,
//! so thumbnails come from the same decoder stack as playback (no extra codec
//! dependency). Audio and subtitles are disabled; hardware decoding is off so a
//! background job never competes with playback for the GPU decoder.

use crate::ffi::*;
use std::ffi::{CString, c_void};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

static WORK_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq)]
pub struct Thumbnail {
    pub image: PathBuf,
    pub duration_ms: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Writes one frame of `media` (at `at_percent` of its duration) to
/// `out_file` as JPEG, scaled to `max_width`. Returns duration and size.
/// Audio-only files produce no image and return `Ok` with `image` missing on disk.
pub fn extract(
    library: &Path,
    media: &Path,
    out_file: &Path,
    at_percent: u8,
    max_width: u32,
    timeout: Duration,
) -> Result<Thumbnail, String> {
    extract_with(
        library,
        media,
        out_file,
        format!("{}%", at_percent.min(95)),
        max_width,
        timeout,
        &[],
    )
}

/// Writes the frame shown at `at_ms` (exact, decoded from the previous
/// keyframe) as a small JPEG for timeline previews. Loop filtering is skipped
/// to keep long-GOP and 4K sources fast; the result is a preview, not a still.
pub fn extract_at_ms(
    library: &Path,
    media: &Path,
    out_file: &Path,
    at_ms: u64,
    max_width: u32,
    timeout: Duration,
) -> Result<Thumbnail, String> {
    extract_with(
        library,
        media,
        out_file,
        format!("{:.3}", at_ms as f64 / 1000.0),
        max_width,
        timeout,
        &[
            ("vd-lavc-skiploopfilter", "all"),
            ("vd-lavc-fast", "yes"),
            ("hr-seek-framedrop", "yes"),
            ("demuxer-max-bytes", "8MiB"),
        ],
    )
}

fn extract_with(
    library: &Path,
    media: &Path,
    out_file: &Path,
    start: String,
    max_width: u32,
    timeout: Duration,
    extra: &[(&str, &str)],
) -> Result<Thumbnail, String> {
    let api = unsafe { MpvApi::load(library) }?;
    let h = unsafe { (api.create)() };
    if h.is_null() {
        return Err("mpv_create failed".into());
    }
    struct Guard<'a>(&'a MpvApi, *mut mpv_handle);
    impl Drop for Guard<'_> {
        fn drop(&mut self) {
            unsafe { (self.0.terminate_destroy)(self.1) };
        }
    }
    let _guard = Guard(&api, h);

    let work = out_file
        .parent()
        .ok_or("output path has no folder")?
        .join(format!(
            ".frame-{}-{}",
            std::process::id(),
            WORK_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let work_str = work.to_string_lossy().into_owned();

    let opts: [(&str, String); 17] = [
        ("config", "no".into()),
        ("load-scripts", "no".into()),
        ("ytdl", "no".into()),
        ("terminal", "no".into()),
        ("idle", "no".into()),
        ("vo", "image".into()),
        ("vo-image-format", "jpg".into()),
        ("vo-image-jpeg-quality", "84".into()),
        ("vo-image-outdir", work_str.clone()),
        ("ao", "null".into()),
        ("aid", "no".into()),
        ("sid", "no".into()),
        ("hwdec", "no".into()),
        ("frames", "1".into()),
        ("start", start),
        ("vf", format!("lavfi=[scale={max_width}:-2]")),
        ("hr-seek", "yes".into()),
    ];
    for (k, v) in &opts {
        let (k, v) = (
            CString::new(*k).unwrap(),
            CString::new(v.as_str()).map_err(|e| e.to_string())?,
        );
        let rc = unsafe { (api.set_option_string)(h, k.as_ptr(), v.as_ptr()) };
        if rc < 0 {
            return Err(format!("option {k:?}: {}", api.error_message(rc)));
        }
    }
    for (k, v) in extra {
        let (k, v) = (
            CString::new(*k).map_err(|e| e.to_string())?,
            CString::new(*v).map_err(|e| e.to_string())?,
        );
        let rc = unsafe { (api.set_option_string)(h, k.as_ptr(), v.as_ptr()) };
        if rc < 0 {
            return Err(format!("option {k:?}: {}", api.error_message(rc)));
        }
    }
    if unsafe { (api.initialize)(h) } < 0 {
        return Err("mpv_initialize failed".into());
    }
    let path = CString::new(media.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let cmd = [c"loadfile".as_ptr(), path.as_ptr(), std::ptr::null()];
    let mut cmd = cmd;
    let rc = unsafe { (api.command)(h, cmd.as_mut_ptr()) };
    if rc < 0 {
        return Err(api.error_message(rc));
    }

    let get = |name: &std::ffi::CStr| -> Option<String> {
        let p = unsafe { (api.get_property_string)(h, name.as_ptr()) };
        if p.is_null() {
            return None;
        }
        let s = unsafe { opt_str(p) };
        unsafe { (api.free)(p as *mut c_void) };
        s
    };

    let deadline = Instant::now() + timeout;
    let mut duration_ms = None;
    let mut size = (None, None);
    let mut failed = None;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            failed = Some("timed out".to_owned());
            break;
        }
        let ev = unsafe { &*(api.wait_event)(h, left.as_secs_f64().min(0.5)) };
        match ev.event_id {
            MPV_EVENT_FILE_LOADED => {
                duration_ms = get(c"duration")
                    .and_then(|d| d.parse::<f64>().ok())
                    .filter(|d| d.is_finite() && *d > 0.0)
                    .map(|d| (d * 1000.0).round() as u64);
                size = (
                    get(c"width").and_then(|v| v.parse().ok()),
                    get(c"height").and_then(|v| v.parse().ok()),
                );
            }
            MPV_EVENT_END_FILE => {
                let data = unsafe { &*(ev.data as *const mpv_event_end_file) };
                if data.reason == MPV_END_FILE_REASON_ERROR {
                    failed = Some(api.error_message(data.error));
                }
                break;
            }
            MPV_EVENT_SHUTDOWN => break,
            _ => {}
        }
    }

    // mpv names frames 00000001.jpg, 00000002.jpg, ...; keep the first.
    let first = std::fs::read_dir(&work).ok().and_then(|rd| {
        rd.filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "jpg"))
            .min()
    });
    let result = match (first, failed) {
        (Some(frame), _) => {
            let _ = std::fs::remove_file(out_file);
            std::fs::rename(&frame, out_file).map_err(|e| e.to_string())?;
            Ok(Thumbnail {
                image: out_file.to_path_buf(),
                duration_ms,
                width: size.0,
                height: size.1,
            })
        }
        (None, Some(err)) => Err(err),
        // Audio-only media: no frame, but the duration is still useful.
        (None, None) => Ok(Thumbnail {
            image: PathBuf::new(),
            duration_ms,
            width: None,
            height: None,
        }),
    };
    let _ = std::fs::remove_dir_all(&work);
    result
}

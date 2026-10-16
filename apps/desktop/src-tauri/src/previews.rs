//! Timeline preview frames: one decoded frame per hovered position, written
//! beside the library thumbnails (the only folder the WebView may load
//! images from) and purged at startup. Only the media that is playing can be
//! previewed, so the frontend cannot use this to read arbitrary files.

use crate::Engine;
use nova_playback_api::PlaybackBackend;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::State;

const PREFIX: &str = "p-";
const WIDTH: u32 = 320;
const TIMEOUT: Duration = Duration::from_millis(2500);

pub struct Previews {
    dir: PathBuf,
    libmpv: PathBuf,
    /// One decoder at a time: previews must never compete with playback.
    busy: AtomicBool,
}

impl Previews {
    pub fn new(dir: PathBuf, libmpv: PathBuf) -> Self {
        purge(&dir);
        Self {
            dir,
            libmpv,
            busy: AtomicBool::new(false),
        }
    }
}

/// Removes preview frames left by an earlier run.
fn purge(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.filter_map(Result::ok) {
        if e.file_name().to_string_lossy().starts_with(PREFIX) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Cache key: path, size and modification time, so an edited file gets new frames.
fn key(media: &Path) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    media.hash(&mut h);
    if let Ok(m) = std::fs::metadata(media) {
        m.len().hash(&mut h);
        m.modified().ok().hash(&mut h);
    }
    h.finish()
}

/// Returns the path of a JPEG showing the playing media at `position_ms`,
/// or an error when no frame can be produced (audio, busy, too slow).
#[tauri::command]
pub async fn preview_frame(
    position_ms: u64,
    engine: State<'_, Engine>,
    previews: State<'_, Previews>,
) -> Result<String, String> {
    let media = engine
        .get()
        .map_err(|e| e.message)?
        .snapshot()
        .path
        .ok_or("nothing is playing")?;
    let media = PathBuf::from(media);
    let out = previews
        .dir
        .join(format!("{PREFIX}{:016x}-{position_ms}.jpg", key(&media)));
    if out.exists() {
        return Ok(out.display().to_string());
    }
    let dir = previews.dir.clone();
    let libmpv = previews.libmpv.clone();
    if previews.busy.swap(true, Ordering::AcqRel) {
        return Err("busy".to_owned());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _ = std::fs::create_dir_all(&dir);
        nova_playback_mpv::thumbnail::extract_at_ms(
            &libmpv,
            &media,
            &out,
            position_ms,
            WIDTH,
            TIMEOUT,
        )
        .and_then(|t| {
            if t.image.as_os_str().is_empty() {
                Err("no picture in this media".to_owned())
            } else {
                Ok(t.image.display().to_string())
            }
        })
    })
    .await
    .map_err(|e| e.to_string());
    previews.busy.store(false, Ordering::Release);
    result?
}

//! NOVA desktop shell: wires the playback backend to typed Tauri commands.
//!
//! The frontend never talks to libmpv. It sends validated `PlaybackCommand`s
//! and receives `PlaybackSnapshot`s on the `playback://snapshot` event.

mod video_surface;

use nova_playback_api::{
    Capabilities, CommandAck, PlaybackBackend, PlaybackCommand, PlaybackError, PlaybackErrorKind,
    PlaybackSnapshot,
};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub const SNAPSHOT_EVENT: &str = "playback://snapshot";

#[derive(Default)]
struct Engine {
    player: Mutex<Option<Arc<MpvPlayer>>>,
    init_error: Mutex<Option<PlaybackError>>,
}

impl Engine {
    fn get(&self) -> Result<Arc<MpvPlayer>, PlaybackError> {
        if let Some(p) = self.player.lock().unwrap().as_ref() {
            return Ok(Arc::clone(p));
        }
        Err(self.init_error.lock().unwrap().clone().unwrap_or_else(|| {
            PlaybackError::new(
                PlaybackErrorKind::EngineUnavailable,
                "playback engine not started",
            )
        }))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineInfo {
    capabilities: Capabilities,
    mpv_version: Option<String>,
    ffmpeg_version: Option<String>,
    video_output: Option<String>,
    audio_output: Option<String>,
    gpu_context: Option<String>,
    hwdec_current: Option<String>,
    library_path: String,
}

#[tauri::command]
fn playback_execute(
    command: PlaybackCommand,
    engine: State<'_, Engine>,
) -> Result<CommandAck, PlaybackError> {
    engine.get()?.execute(command)
}

#[tauri::command]
fn playback_snapshot(engine: State<'_, Engine>) -> Result<PlaybackSnapshot, PlaybackError> {
    Ok(engine.get()?.snapshot())
}

#[tauri::command]
fn engine_info(engine: State<'_, Engine>) -> Result<EngineInfo, PlaybackError> {
    let p = engine.get()?;
    let d = p.diagnostics();
    Ok(EngineInfo {
        capabilities: p.capabilities(),
        mpv_version: d.mpv_version,
        ffmpeg_version: d.ffmpeg_version,
        video_output: d.current_vo,
        audio_output: d.current_ao,
        gpu_context: d.gpu_api,
        hwdec_current: d.hwdec_current,
        library_path: libmpv_path().display().to_string(),
    })
}

/// Media path passed on the command line (OS "Open with", file association).
#[tauri::command]
fn launch_media_path() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| p.is_file())
        .map(|p| p.display().to_string())
}

/// Resolution order: NOVA_LIBMPV_PATH, next to the executable, then the
/// repository's vendor directory (debug builds only).
fn libmpv_path() -> PathBuf {
    const NAME: &str = "libmpv-2.dll";
    if let Some(p) = std::env::var_os("NOVA_LIBMPV_PATH") {
        return PathBuf::from(p);
    }
    let beside_exe = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.join(NAME)));
    if let Some(p) = beside_exe.as_ref().filter(|p| p.exists()) {
        return p.clone();
    }
    if cfg!(debug_assertions) {
        let vendored = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../vendor/libmpv")
            .join(NAME);
        if vendored.exists() {
            return vendored;
        }
    }
    beside_exe.unwrap_or_else(|| PathBuf::from(NAME))
}

fn start_engine(app: &AppHandle) -> Result<MpvPlayer, PlaybackError> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        PlaybackError::new(PlaybackErrorKind::EngineUnavailable, "main window missing")
    })?;
    let wid = video_surface::native_handle(&window)?;
    let emitter = app.clone();
    let sink = Arc::new(move |snapshot: PlaybackSnapshot| {
        if let Err(e) = emitter.emit(SNAPSHOT_EVENT, &snapshot) {
            log::warn!("snapshot emit failed: {e}");
        }
    });
    let config = MpvConfig {
        library_path: libmpv_path(),
        window_handle: Some(wid),
        headless: false,
        hwdec: std::env::var("NOVA_HWDEC").unwrap_or_else(|_| "auto-safe".into()),
    };
    log::info!("starting libmpv from {}", config.library_path.display());
    let player = MpvPlayer::new(config, sink)?;
    video_surface::place_engine_surface_below_webview(wid);
    Ok(player)
}

/// Developer aid: `NOVA_STATS=1` logs engine-measured playback statistics
/// every two seconds (A/V desync, dropped frames, decoder, output).
fn spawn_stats_logger(player: std::sync::Weak<MpvPlayer>) {
    std::thread::spawn(move || {
        while let Some(p) = player.upgrade() {
            let d = p.diagnostics();
            let s = p.snapshot();
            log::info!(
                target: "nova::stats",
                "phase={:?} pos={}ms avsync={:?}s decoder_drops={:?} vo_drops={:?} vo_delayed={:?} vf_fps={:?} display_fps={:?} vo={:?} gpu={:?} hwdec={:?}",
                s.phase, s.position_ms, d.avsync_secs, d.decoder_drops, d.vo_drops, d.vo_delayed_frames,
                d.estimated_vf_fps, d.display_fps, d.current_vo, d.gpu_api, d.hwdec_current
            );
            drop(p);
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .manage(Engine::default())
        .setup(|app| {
            let engine = app.state::<Engine>();
            match start_engine(app.handle()) {
                Ok(p) => {
                    let p = Arc::new(p);
                    if std::env::var_os("NOVA_STATS").is_some() {
                        spawn_stats_logger(Arc::downgrade(&p));
                    }
                    *engine.player.lock().unwrap() = Some(p);
                }
                Err(e) => {
                    log::error!("playback engine unavailable: {e}");
                    *engine.init_error.lock().unwrap() = Some(e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            playback_execute,
            playback_snapshot,
            engine_info,
            launch_media_path
        ])
        .build(tauri::generate_context!())
        .expect("failed to build NOVA")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Destroy the engine deterministically before the process exits.
                let engine = app.state::<Engine>();
                let player = engine.player.lock().unwrap().take();
                drop(player);
                log::info!("engine shut down");
            }
        });
}

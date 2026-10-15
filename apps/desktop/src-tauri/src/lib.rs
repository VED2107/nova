//! NOVA desktop shell: wires the playback backend to typed Tauri commands.
//!
//! The frontend never talks to libmpv. It sends validated `PlaybackCommand`s
//! and receives `PlaybackSnapshot`s on the `playback://snapshot` event.

mod library;
mod video_surface;

use nova_application::progress_service::{ProgressService, ResumeNotice};
use nova_application::queue_service::QueueService;
use nova_domain::progress::ResumePolicy;
use nova_domain::queue::{QueueItemId, QueueSnapshot};
use nova_playback_api::{
    Capabilities, CommandAck, PlaybackBackend, PlaybackCommand, PlaybackError, PlaybackErrorKind,
    PlaybackSnapshot,
};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use nova_storage::{Store, StoreError};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub const SNAPSHOT_EVENT: &str = "playback://snapshot";
pub const QUEUE_EVENT: &str = "queue://changed";
pub const RESUMED_EVENT: &str = "playback://resumed";

type Queue = Arc<QueueService>;

/// Progress tracking is optional: playback works without a database.
struct Progress(Option<Arc<ProgressService>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResumedPayload {
    session_id: u64,
    position_ms: u64,
}

/// Opens the library database. A corrupt file is moved aside (never deleted)
/// and a fresh one created; a database from a newer NOVA is left untouched
/// and NOVA runs without persistence.
fn open_store(path: &std::path::Path) -> Option<Store> {
    match Store::open(path) {
        Ok(s) => return Some(s),
        Err(StoreError::TooNew { found, supported }) => {
            log::error!(
                "library database is schema v{found}, this NOVA supports v{supported}; progress will not be saved"
            );
            return None;
        }
        Err(e) => log::error!("library database unusable ({e}); moving it aside"),
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    for suffix in ["", "-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", path.display()));
        if from.exists() {
            let to = PathBuf::from(format!("{}.corrupt-{stamp}{suffix}", path.display()));
            if let Err(e) = std::fs::rename(&from, &to) {
                log::error!("could not move aside {}: {e}", from.display());
                return None;
            }
        }
    }
    Store::open(path)
        .map_err(|e| log::error!("fresh library database failed: {e}"))
        .ok()
}

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
fn playback_media_details(
    engine: State<'_, Engine>,
) -> Result<Option<nova_playback_api::MediaDetails>, PlaybackError> {
    Ok(engine.get()?.media_details())
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

/// Media paths passed on the command line (OS "Open with", file association).
#[tauri::command]
fn launch_media_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .map(|p| p.display().to_string())
        .collect()
}

#[tauri::command]
fn queue_get(queue: State<'_, Queue>) -> QueueSnapshot {
    queue.snapshot()
}

#[tauri::command]
fn queue_open(paths: Vec<String>, queue: State<'_, Queue>) -> Result<QueueSnapshot, PlaybackError> {
    queue.open(paths)
}

#[tauri::command]
fn queue_append(
    paths: Vec<String>,
    queue: State<'_, Queue>,
) -> Result<QueueSnapshot, PlaybackError> {
    queue.append(paths)
}

#[tauri::command]
fn queue_select(id: QueueItemId, queue: State<'_, Queue>) -> Result<QueueSnapshot, PlaybackError> {
    queue.select(id)
}

#[tauri::command]
fn queue_next(queue: State<'_, Queue>) -> Result<QueueSnapshot, PlaybackError> {
    queue.next()
}

#[tauri::command]
fn queue_previous(queue: State<'_, Queue>) -> Result<QueueSnapshot, PlaybackError> {
    queue.previous()
}

#[tauri::command]
fn queue_remove(id: QueueItemId, queue: State<'_, Queue>) -> QueueSnapshot {
    queue.remove(id)
}

#[tauri::command]
fn queue_move(id: QueueItemId, to: usize, queue: State<'_, Queue>) -> QueueSnapshot {
    queue.move_item(id, to)
}

#[tauri::command]
fn queue_clear(queue: State<'_, Queue>) -> QueueSnapshot {
    queue.clear()
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

/// Saves a preference and applies engine-side ones immediately.
#[tauri::command]
fn prefs_set(
    key: String,
    value: String,
    lib: State<'_, library::LibraryState>,
    engine: State<'_, Engine>,
    progress: State<'_, Progress>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let store = &lib
        .0
        .as_ref()
        .ok_or("The library database is unavailable.")?
        .store;
    if !store
        .set_preference(&key, &value)
        .map_err(|e| e.to_string())?
    {
        return Err(format!("Unknown setting {key}={value}"));
    }
    match key.as_str() {
        "hwdec" => {
            if let Ok(p) = engine.get() {
                p.execute(PlaybackCommand::SetHardwareDecoding {
                    enabled: value == "auto",
                })
                .map_err(|e| e.message)?;
            }
        }
        "resume" => {
            if let Some(p) = &progress.0 {
                p.set_resume_enabled(value == "on");
            }
        }
        _ => {}
    }
    store.preferences().map_err(|e| e.to_string())
}

/// App data root. `NOVA_DATA_DIR` isolates a profile (tests, demos, verification).
fn data_dir(app: &tauri::App) -> Result<PathBuf, tauri::Error> {
    match std::env::var_os("NOVA_DATA_DIR") {
        Some(d) => Ok(PathBuf::from(d)),
        None => app.path().app_data_dir(),
    }
}

fn start_engine(
    app: &AppHandle,
    queue: Queue,
    progress: Option<Arc<ProgressService>>,
    hwdec: String,
) -> Result<MpvPlayer, PlaybackError> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        PlaybackError::new(PlaybackErrorKind::EngineUnavailable, "main window missing")
    })?;
    let wid = video_surface::native_handle(&window)?;
    let emitter = app.clone();
    let sink = Arc::new(move |snapshot: PlaybackSnapshot| {
        if let Err(e) = emitter.emit(SNAPSHOT_EVENT, &snapshot) {
            log::warn!("snapshot emit failed: {e}");
        }
        if let Some(p) = &progress {
            p.on_snapshot(&snapshot);
        }
        // Runs on the engine event thread: hand the advance to another thread.
        if queue.on_snapshot(&snapshot) {
            let queue = Arc::clone(&queue);
            std::thread::spawn(move || queue.advance_after_end());
        }
    });
    let config = MpvConfig {
        library_path: libmpv_path(),
        window_handle: Some(wid),
        headless: false,
        hwdec: std::env::var("NOVA_HWDEC").unwrap_or(hwdec),
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
                "session={} phase={:?} pos={}ms avsync={:?}s decoder_drops={:?} vo_drops={:?} vo_delayed={:?} vf_fps={:?} display_fps={:?} vo={:?} gpu={:?} hwdec={:?}",
                s.session_id, s.phase, s.position_ms, d.avsync_secs, d.decoder_drops, d.vo_drops, d.vo_delayed_frames,
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
            let emitter = app.handle().clone();
            let queue: Queue = QueueService::new(Box::new(move |snapshot| {
                if let Err(e) = emitter.emit(QUEUE_EVENT, &snapshot) {
                    log::warn!("queue emit failed: {e}");
                }
            }));
            app.manage(Arc::clone(&queue));

            let data = data_dir(app)?;
            let db_path = data.join("library.sqlite3");
            let store = open_store(&db_path).map(Arc::new);
            let prefs = store
                .as_ref()
                .and_then(|s| s.preferences().ok())
                .unwrap_or_default();
            let pref = |k: &str, d: &str| prefs.get(k).cloned().unwrap_or_else(|| d.to_owned());
            // Thumbnails are served to the WebView only from this folder.
            let _ = std::fs::create_dir_all(data.join("thumbs"));
            if let Err(e) = app
                .asset_protocol_scope()
                .allow_directory(data.join("thumbs"), false)
            {
                log::warn!("thumbnail folder not served: {e}");
            }
            let library = store.as_ref().map(|s| {
                library::start(
                    Arc::clone(s),
                    app.handle(),
                    libmpv_path(),
                    data.join("thumbs"),
                )
            });
            app.manage(library::LibraryState(library));
            let progress = store.map(|store| {
                log::info!(
                    "library database ready (schema v{})",
                    nova_storage::SCHEMA_VERSION
                );
                let emitter = app.handle().clone();
                ProgressService::new(
                    store,
                    ResumePolicy::default(),
                    Box::new(move |n: ResumeNotice| {
                        log::info!("resuming at {} ms", n.position_ms);
                        let payload = ResumedPayload {
                            session_id: n.session_id,
                            position_ms: n.position_ms,
                        };
                        let _ = emitter.emit(RESUMED_EVENT, payload);
                    }),
                )
            });
            if let Some(p) = &progress {
                p.set_resume_enabled(pref("resume", "on") == "on");
                queue.attach_progress(Arc::clone(p));
            }
            let hwdec = if pref("hwdec", "auto") == "auto" {
                "auto-safe"
            } else {
                "no"
            };
            app.manage(Progress(progress.clone()));

            let engine = app.state::<Engine>();
            match start_engine(app.handle(), Arc::clone(&queue), progress, hwdec.into()) {
                Ok(p) => {
                    let p = Arc::new(p);
                    let backend: Arc<dyn PlaybackBackend> = p.clone();
                    queue.attach(&backend);
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
            playback_media_details,
            engine_info,
            launch_media_paths,
            queue_get,
            queue_open,
            queue_append,
            queue_select,
            queue_next,
            queue_previous,
            queue_remove,
            queue_move,
            queue_clear,
            library::library_roots,
            library::library_add_root,
            library::library_remove_root,
            library::library_rescan,
            library::library_cancel_scans,
            library::library_scan_status,
            library::library_search,
            library::library_continue_watching,
            library::library_recently_added,
            library::library_thumb_dir,
            library::library_clear_history,
            library::playlists_list,
            library::playlist_create,
            library::playlist_rename,
            library::playlist_delete,
            library::playlist_entries,
            library::media_durations,
            library::prefs_get,
            prefs_set
        ])
        .build(tauri::generate_context!())
        .expect("failed to build NOVA")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Destroy the engine deterministically before the process exits.
                // Stop scanning first: committed batches stay committed.
                if let Some(lib) = &app.state::<library::LibraryState>().0 {
                    lib.scans.shutdown();
                    lib.thumbs.shutdown();
                }
                let engine = app.state::<Engine>();
                let player = engine.player.lock().unwrap().take();
                // Persist the final position before the engine goes away.
                if let Some(progress) = &app.state::<Progress>().0 {
                    progress.shutdown(player.as_ref().map(|p| p.snapshot()).as_ref());
                    log::info!("progress saved");
                }
                drop(player);
                log::info!("engine shut down");
            }
        });
}

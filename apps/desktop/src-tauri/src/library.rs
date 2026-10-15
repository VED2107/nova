//! Media-library commands and events. All filesystem and database work runs
//! on Tauri's command threads or the scan worker, never the UI thread.

use nova_library::thumbs::ThumbnailWorker;
use nova_library::{ScanManager, ScanProgress};
use nova_storage::Store;
use nova_storage::extras::{PlaylistEntry, PlaylistSummary};
use nova_storage::library::{LibraryItem, LibrarySort, RootId, ScanRoot, SearchPage};
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub const SCAN_EVENT: &str = "library://scan";
pub const CHANGED_EVENT: &str = "library://changed";

pub struct Library {
    pub store: Arc<Store>,
    pub scans: ScanManager,
    pub thumbs: Arc<ThumbnailWorker>,
    pub thumb_dir: std::path::PathBuf,
}

/// `None` when the database could not be opened; commands then report it.
pub struct LibraryState(pub Option<Library>);

impl LibraryState {
    fn get(&self) -> Result<&Library, String> {
        self.0
            .as_ref()
            .ok_or_else(|| "The library database is unavailable; see the log for details.".into())
    }
}

pub fn start(
    store: Arc<Store>,
    app: &AppHandle,
    libmpv: std::path::PathBuf,
    thumb_dir: std::path::PathBuf,
) -> Library {
    match store.mark_interrupted_jobs() {
        Ok(0) => {}
        Ok(n) => log::warn!("{n} library scan(s) were interrupted by the last exit"),
        Err(e) => log::warn!("could not check interrupted scans: {e}"),
    }
    let emitter = app.clone();
    let thumbs = Arc::new(ThumbnailWorker::start(
        Arc::clone(&store),
        libmpv,
        thumb_dir.clone(),
        Box::new(move |done| {
            if done > 0 {
                let _ = emitter.emit(CHANGED_EVENT, ());
            }
        }),
    ));
    let emitter = app.clone();
    let kick = Arc::clone(&thumbs);
    let scans = ScanManager::new(
        Arc::clone(&store),
        Box::new(move |p: &ScanProgress| {
            let _ = emitter.emit(SCAN_EVENT, p);
            if p.state != nova_library::ScanState::Scanning {
                let _ = emitter.emit(CHANGED_EVENT, ());
                kick.kick();
            }
        }),
    );
    Library {
        store,
        scans,
        thumbs,
        thumb_dir,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    current: Option<ScanProgress>,
    queued: Vec<RootId>,
}

fn parse_sort(s: &str) -> LibrarySort {
    match s {
        "title" => LibrarySort::Title,
        "added" => LibrarySort::RecentlyAdded,
        _ => LibrarySort::Relevance,
    }
}

#[tauri::command]
pub fn library_roots(lib: State<'_, LibraryState>) -> Result<Vec<ScanRoot>, String> {
    lib.get()?.store.roots().map_err(|e| e.to_string())
}

/// Adds a folder and starts scanning it.
#[tauri::command]
pub fn library_add_root(
    path: String,
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<ScanRoot, String> {
    let lib = lib.get()?;
    let root = lib
        .store
        .add_root(Path::new(&path))
        .map_err(|e| e.to_string())?;
    lib.scans.enqueue([root.id]);
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(root)
}

/// Removes a folder from the library. Files and watch progress are kept.
#[tauri::command]
pub fn library_remove_root(
    id: RootId,
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<(), String> {
    let lib = lib.get()?;
    lib.scans.cancel_root(id);
    lib.store.remove_root(id).map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

/// Rescans the given roots, or all roots when `ids` is empty.
#[tauri::command]
pub fn library_rescan(ids: Vec<RootId>, lib: State<'_, LibraryState>) -> Result<(), String> {
    let lib = lib.get()?;
    let ids = if ids.is_empty() {
        lib.store
            .roots()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|r| r.id)
            .collect()
    } else {
        ids
    };
    lib.scans.enqueue(ids);
    Ok(())
}

#[tauri::command]
pub fn library_cancel_scans(lib: State<'_, LibraryState>) -> Result<(), String> {
    lib.get()?.scans.cancel_all();
    Ok(())
}

#[tauri::command]
pub fn library_scan_status(lib: State<'_, LibraryState>) -> Result<ScanStatus, String> {
    let (current, queued) = lib.get()?.scans.status();
    Ok(ScanStatus { current, queued })
}

#[tauri::command]
pub fn library_search(
    query: String,
    sort: String,
    include_missing: bool,
    offset: i64,
    limit: i64,
    root_id: Option<RootId>,
    lib: State<'_, LibraryState>,
) -> Result<SearchPage, String> {
    lib.get()?
        .store
        .search_in(
            &query,
            parse_sort(&sort),
            include_missing,
            limit,
            offset,
            root_id,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_continue_watching(
    limit: i64,
    lib: State<'_, LibraryState>,
) -> Result<Vec<LibraryItem>, String> {
    lib.get()?
        .store
        .continue_watching(limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_recently_added(
    limit: i64,
    lib: State<'_, LibraryState>,
) -> Result<Vec<LibraryItem>, String> {
    lib.get()?
        .store
        .recently_added(limit)
        .map_err(|e| e.to_string())
}

/// Folder holding `<media id>.jpg` poster frames (served via the asset protocol).
#[tauri::command]
pub fn library_thumb_dir(lib: State<'_, LibraryState>) -> Result<String, String> {
    Ok(lib.get()?.thumb_dir.display().to_string())
}

/// Forgets all watch progress. Files and the library are untouched.
#[tauri::command]
pub fn library_clear_history(
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<usize, String> {
    let n = lib
        .get()?
        .store
        .clear_history()
        .map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(n)
}

#[tauri::command]
pub fn playlists_list(lib: State<'_, LibraryState>) -> Result<Vec<PlaylistSummary>, String> {
    lib.get()?.store.playlists().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_create(
    name: String,
    entries: Vec<PlaylistEntry>,
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<i64, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err("Give the playlist a name (up to 120 characters).".into());
    }
    let id = lib
        .get()?
        .store
        .create_playlist(name, &entries)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(id)
}

#[tauri::command]
pub fn playlist_rename(
    id: i64,
    name: String,
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err("Give the playlist a name (up to 120 characters).".into());
    }
    lib.get()?
        .store
        .rename_playlist(id, name)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn playlist_delete(
    id: i64,
    lib: State<'_, LibraryState>,
    app: AppHandle,
) -> Result<(), String> {
    lib.get()?
        .store
        .delete_playlist(id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistPlayable {
    paths: Vec<String>,
    missing: Vec<String>,
}

/// Splits a playlist into files that exist and files that are gone.
#[tauri::command]
pub fn playlist_entries(id: i64, lib: State<'_, LibraryState>) -> Result<PlaylistPlayable, String> {
    let entries = lib
        .get()?
        .store
        .playlist_entries(id)
        .map_err(|e| e.to_string())?
        .ok_or("That playlist no longer exists.")?;
    let (paths, missing) = entries
        .into_iter()
        .map(|e| e.path)
        .partition(|p| Path::new(p).is_file());
    Ok(PlaylistPlayable { paths, missing })
}

/// Engine-measured durations for paths (queue display).
#[tauri::command]
pub fn media_durations(
    paths: Vec<String>,
    lib: State<'_, LibraryState>,
) -> Result<std::collections::BTreeMap<String, u64>, String> {
    lib.get()?
        .store
        .durations_for(&paths)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prefs_get(
    lib: State<'_, LibraryState>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    lib.get()?.store.preferences().map_err(|e| e.to_string())
}

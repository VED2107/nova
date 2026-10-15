//! Media library persistence: scan roots, scan jobs, scan batches, search,
//! Continue Watching.
//!
//! Library rules:
//! - A *scan root* is a user-selected folder. Roots may not overlap (one may
//!   not contain another), so every file has at most one root.
//! - A library item is a `media_item` with a `root_id`. Items are never
//!   deleted by scans: a file that is not found by a **completed** scan is
//!   flagged `missing` (its progress is kept so it can recover if the file
//!   returns). Cancelled, failed or interrupted scans never flag anything.
//! - Removing a root detaches its items (`root_id = NULL`); progress stays.

use crate::identity::{FileIdentity, canonical_path};
use crate::{Resolution, Store, StoreError, now_ms, resolve_in};
use nova_application::progress_service::MediaId;
use nova_domain::progress::SavedProgress;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub type RootId = i64;
pub type JobId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastScan {
    pub status: String,
    pub started_at_ms: i64,
    pub finished_at_ms: Option<i64>,
    pub files_seen: i64,
    pub files_added: i64,
    pub files_updated: i64,
    pub files_missing: i64,
    pub errors: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    pub id: RootId,
    pub path: String,
    pub item_count: i64,
    pub missing_count: i64,
    pub last_scan: Option<LastScan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddRootError {
    NotADirectory,
    AlreadyAdded,
    /// The folder is inside, or contains, an existing root.
    Overlaps(String),
    Store(String),
}

impl std::fmt::Display for AddRootError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotADirectory => write!(f, "not an accessible folder"),
            Self::AlreadyAdded => write!(f, "folder is already in the library"),
            Self::Overlaps(other) => write!(f, "folder overlaps library folder {other}"),
            Self::Store(e) => write!(f, "{e}"),
        }
    }
}

/// One file observed by a scan.
#[derive(Debug, Clone)]
pub enum ScanEntry {
    /// Known path with unchanged size and modification time (not re-read).
    Unchanged(MediaId),
    /// New or modified file, fingerprinted by the scanner.
    Changed(FileIdentity),
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BatchResult {
    pub added: i64,
    pub updated: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Completed,
    Cancelled,
    Failed,
}

impl JobStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JobCounters {
    pub seen: i64,
    pub added: i64,
    pub updated: i64,
    pub errors: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LibrarySort {
    /// Search rank when a query is given, otherwise title.
    #[default]
    Relevance,
    Title,
    RecentlyAdded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: MediaId,
    pub title: String,
    pub path: String,
    pub folder: String,
    pub size_bytes: i64,
    pub missing: bool,
    pub progress: Option<SavedProgress>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<LibraryItem>,
    pub total: i64,
}

/// Turns free text into a safe FTS5 query: every alphanumeric run becomes a
/// quoted prefix term, so user input can never inject FTS syntax.
pub fn fts_query(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .take(16)
        .map(|t| format!("\"{t}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

fn is_within(child: &Path, parent: &Path) -> bool {
    // Component-wise and case-insensitive (Windows paths are case-insensitive).
    let c: Vec<String> = child
        .components()
        .map(|x| x.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let p: Vec<String> = parent
        .components()
        .map(|x| x.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    c.len() >= p.len() && c[..p.len()] == p[..]
}

const ITEM_COLUMNS: &str = "m.id, m.title, m.path, m.folder, m.size_bytes, m.missing,
     p.position_ms, p.duration_ms, p.completed";

fn item_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryItem> {
    let position: Option<i64> = r.get(6)?;
    Ok(LibraryItem {
        id: r.get(0)?,
        title: r.get(1)?,
        path: r.get(2)?,
        folder: r.get(3)?,
        size_bytes: r.get(4)?,
        missing: r.get(5)?,
        progress: match position {
            Some(pos) => Some(SavedProgress {
                position_ms: pos.max(0) as u64,
                duration_ms: r.get::<_, Option<i64>>(7)?.map(|d| d.max(0) as u64),
                completed: r.get(8)?,
            }),
            None => None,
        },
    })
}

impl Store {
    pub fn add_root(&self, path: &Path) -> Result<ScanRoot, AddRootError> {
        let canonical: PathBuf = canonical_path(path).map_err(|_| AddRootError::NotADirectory)?;
        if !canonical.is_dir() {
            return Err(AddRootError::NotADirectory);
        }
        let existing = self
            .roots()
            .map_err(|e| AddRootError::Store(e.to_string()))?;
        for r in &existing {
            let other = Path::new(&r.path);
            if is_within(&canonical, other) && is_within(other, &canonical) {
                return Err(AddRootError::AlreadyAdded);
            }
            if is_within(&canonical, other) || is_within(other, &canonical) {
                return Err(AddRootError::Overlaps(r.path.clone()));
            }
        }
        let path_str = canonical.to_string_lossy().into_owned();
        let conn = self.lock();
        conn.execute(
            "INSERT INTO scan_root (path, added_at_ms) VALUES (?1, ?2)",
            params![path_str, now_ms()],
        )
        .map_err(|e| AddRootError::Store(e.to_string()))?;
        let id = conn.last_insert_rowid();
        drop(conn);
        Ok(ScanRoot {
            id,
            path: path_str,
            item_count: 0,
            missing_count: 0,
            last_scan: None,
        })
    }

    pub fn roots(&self) -> Result<Vec<ScanRoot>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT r.id, r.path,
                    (SELECT count(*) FROM media_item m WHERE m.root_id = r.id AND m.missing = 0),
                    (SELECT count(*) FROM media_item m WHERE m.root_id = r.id AND m.missing = 1),
                    j.status, j.started_at_ms, j.finished_at_ms, j.files_seen, j.files_added,
                    j.files_updated, j.files_missing, j.errors, j.last_error
             FROM scan_root r
             LEFT JOIN scan_job j ON j.id = (SELECT max(id) FROM scan_job WHERE root_id = r.id)
             ORDER BY r.path COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |r| {
            let status: Option<String> = r.get(4)?;
            Ok(ScanRoot {
                id: r.get(0)?,
                path: r.get(1)?,
                item_count: r.get(2)?,
                missing_count: r.get(3)?,
                last_scan: match status {
                    Some(status) => Some(LastScan {
                        status,
                        started_at_ms: r.get(5)?,
                        finished_at_ms: r.get(6)?,
                        files_seen: r.get(7)?,
                        files_added: r.get(8)?,
                        files_updated: r.get(9)?,
                        files_missing: r.get(10)?,
                        errors: r.get(11)?,
                        last_error: r.get(12)?,
                    }),
                    None => None,
                },
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn root_path(&self, root: RootId) -> Result<Option<String>, StoreError> {
        Ok(self
            .lock()
            .query_row("SELECT path FROM scan_root WHERE id = ?1", [root], |r| {
                r.get(0)
            })
            .optional()?)
    }

    /// Removes a root. Its items leave the library but keep their progress.
    pub fn remove_root(&self, root: RootId) -> Result<bool, StoreError> {
        Ok(self
            .lock()
            .execute("DELETE FROM scan_root WHERE id = ?1", [root])?
            > 0)
    }

    pub fn begin_job(&self, root: RootId) -> Result<JobId, StoreError> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO scan_job (root_id, status, started_at_ms) VALUES (?1, 'running', ?2)",
            params![root, now_ms()],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Jobs left `running` by a crash or forced exit become `interrupted`.
    pub fn mark_interrupted_jobs(&self) -> Result<usize, StoreError> {
        Ok(self.lock().execute(
            "UPDATE scan_job SET status = 'interrupted', finished_at_ms = ?1 WHERE status = 'running'",
            [now_ms()],
        )?)
    }

    /// Id, size and mtime of a known path (to skip re-reading unchanged files).
    pub fn known_file(
        &self,
        path: &str,
    ) -> Result<Option<(MediaId, i64, Option<i64>)>, StoreError> {
        Ok(self
            .lock()
            .query_row(
                "SELECT id, size_bytes, modified_ms FROM media_item WHERE path = ?1",
                [path],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?)
    }

    /// Records a batch of observed files in one transaction.
    pub fn record_batch(
        &self,
        job: JobId,
        root: RootId,
        entries: &[ScanEntry],
    ) -> Result<BatchResult, StoreError> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let now = now_ms();
        let mut result = BatchResult::default();
        for entry in entries {
            let id = match entry {
                ScanEntry::Unchanged(id) => *id,
                ScanEntry::Changed(file) => {
                    let (id, how) = resolve_in(&tx, file)?;
                    match how {
                        Resolution::New => result.added += 1,
                        Resolution::Moved | Resolution::ContentChanged => result.updated += 1,
                        Resolution::Existing => {}
                    }
                    id
                }
            };
            let newly_in_root: bool = tx.query_row(
                "SELECT root_id IS NOT ?2 OR missing = 1 FROM media_item WHERE id = ?1",
                params![id, root],
                |r| r.get(0),
            )?;
            if newly_in_root && matches!(entry, ScanEntry::Unchanged(_)) {
                result.updated += 1;
            }
            tx.execute(
                "UPDATE media_item SET root_id = ?2, missing = 0, last_seen_job = ?3,
                        added_to_library_ms = coalesce(added_to_library_ms, ?4)
                 WHERE id = ?1",
                params![id, root, job, now],
            )?;
        }
        tx.execute(
            "UPDATE scan_job SET files_seen = files_seen + ?2, files_added = files_added + ?3,
                    files_updated = files_updated + ?4 WHERE id = ?1",
            params![job, entries.len() as i64, result.added, result.updated],
        )?;
        tx.commit()?;
        Ok(result)
    }

    /// Finishes a job. Only a completed scan flags unseen items as missing.
    /// Returns the number of items newly flagged missing.
    pub fn finish_job(
        &self,
        job: JobId,
        root: RootId,
        status: JobStatus,
        errors: i64,
        last_error: Option<&str>,
    ) -> Result<i64, StoreError> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let missing = if status == JobStatus::Completed {
            tx.execute(
                "UPDATE media_item SET missing = 1
                 WHERE root_id = ?1 AND missing = 0 AND (last_seen_job IS NULL OR last_seen_job != ?2)",
                params![root, job],
            )? as i64
        } else {
            0
        };
        tx.execute(
            "UPDATE scan_job SET status = ?2, finished_at_ms = ?3, files_missing = ?4, errors = ?5, last_error = ?6
             WHERE id = ?1",
            params![job, status.as_str(), now_ms(), missing, errors, last_error],
        )?;
        tx.commit()?;
        Ok(missing)
    }

    /// Searches library items (items with a root). Empty query lists all.
    pub fn search(
        &self,
        query: &str,
        sort: LibrarySort,
        include_missing: bool,
        limit: i64,
        offset: i64,
    ) -> Result<SearchPage, StoreError> {
        let conn = self.lock();
        let fts = fts_query(query);
        let missing_clause = if include_missing {
            ""
        } else {
            "AND m.missing = 0"
        };
        let order = match (sort, fts.is_some()) {
            (LibrarySort::Relevance, true) => "bm25(media_fts), m.title COLLATE NOCASE",
            (LibrarySort::RecentlyAdded, _) => "m.added_to_library_ms DESC, m.id DESC",
            _ => "m.title COLLATE NOCASE, m.id",
        };
        let (from, filter) = match &fts {
            Some(_) => (
                "media_fts JOIN media_item m ON m.id = media_fts.rowid",
                "media_fts MATCH ?1",
            ),
            None => ("media_item m", "?1 IS NULL"),
        };
        let base = format!(
            "FROM {from} LEFT JOIN playback_progress p ON p.media_id = m.id
                            WHERE {filter} AND m.root_id IS NOT NULL {missing_clause}"
        );
        let total: i64 =
            conn.query_row(&format!("SELECT count(*) {base}"), [&fts], |r| r.get(0))?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {ITEM_COLUMNS} {base} ORDER BY {order} LIMIT ?2 OFFSET ?3"
        ))?;
        let items = stmt
            .query_map(
                params![fts, limit.clamp(1, 500), offset.max(0)],
                item_from_row,
            )?
            .collect::<Result<_, _>>()?;
        Ok(SearchPage { items, total })
    }

    /// Media with unfinished progress, most recently watched first. Includes
    /// files played outside the library; flags files that no longer exist.
    pub fn continue_watching(&self, limit: i64) -> Result<Vec<LibraryItem>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {ITEM_COLUMNS} FROM playback_progress p JOIN media_item m ON m.id = p.media_id
             WHERE p.completed = 0 AND p.position_ms > 0
             ORDER BY p.updated_at_ms DESC LIMIT ?1"
        ))?;
        let mut items: Vec<LibraryItem> = stmt
            .query_map([limit.clamp(1, 100)], item_from_row)?
            .collect::<Result<_, _>>()?;
        for item in &mut items {
            if item.title.is_empty() {
                item.title = crate::title_and_folder(&item.path).0;
            }
            item.missing = item.missing || !Path::new(&item.path).exists();
        }
        Ok(items)
    }

    pub fn recently_added(&self, limit: i64) -> Result<Vec<LibraryItem>, StoreError> {
        Ok(self
            .search("", LibrarySort::RecentlyAdded, false, limit, 0)?
            .items)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::FileIdentity;
    use std::time::Instant;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir()
            .join("nova-library-store-tests")
            .join(name);
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn file(path: &Path, seed: u8) -> FileIdentity {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![seed; 1000]).unwrap();
        FileIdentity::from_path(path).unwrap()
    }

    #[test]
    fn fts_query_is_sanitized() {
        assert_eq!(fts_query("  "), None);
        assert_eq!(fts_query("star wars"), Some("\"star\"* \"wars\"*".into()));
        assert_eq!(fts_query("S01E02.mkv"), Some("\"S01E02\"* \"mkv\"*".into()));
        assert_eq!(
            fts_query("a\" OR title:*) NEAR("),
            Some("\"a\"* \"OR\"* \"title\"* \"NEAR\"*".into())
        );
    }

    #[test]
    fn roots_reject_overlap_and_duplicates() {
        let d = dir("roots");
        std::fs::create_dir_all(d.join("movies/kids")).unwrap();
        std::fs::create_dir_all(d.join("shows")).unwrap();
        let s = Store::open_in_memory().unwrap();
        s.add_root(&d.join("movies")).unwrap();
        assert_eq!(
            s.add_root(&d.join("movies")),
            Err(AddRootError::AlreadyAdded)
        );
        assert!(matches!(
            s.add_root(&d.join("movies/kids")),
            Err(AddRootError::Overlaps(_))
        ));
        assert!(matches!(s.add_root(&d), Err(AddRootError::Overlaps(_))));
        assert_eq!(
            s.add_root(&d.join("nope")),
            Err(AddRootError::NotADirectory)
        );
        s.add_root(&d.join("shows")).unwrap();
        assert_eq!(s.roots().unwrap().len(), 2);
    }

    #[test]
    fn completed_scan_flags_unseen_but_cancelled_does_not() {
        let d = dir("missing");
        let s = Store::open_in_memory().unwrap();
        let root = s.add_root(&d).unwrap().id;
        let a = file(&d.join("a.mkv"), 1);
        let b = file(&d.join("b.mkv"), 2);
        let job = s.begin_job(root).unwrap();
        let r = s
            .record_batch(
                job,
                root,
                &[ScanEntry::Changed(a.clone()), ScanEntry::Changed(b)],
            )
            .unwrap();
        assert_eq!(
            r,
            BatchResult {
                added: 2,
                updated: 0
            }
        );
        assert_eq!(
            s.finish_job(job, root, JobStatus::Completed, 0, None)
                .unwrap(),
            0
        );

        // Second scan sees only `a` but is cancelled: nothing flagged.
        let job = s.begin_job(root).unwrap();
        let id_a = s.known_file(&a.path).unwrap().unwrap().0;
        s.record_batch(job, root, &[ScanEntry::Unchanged(id_a)])
            .unwrap();
        assert_eq!(
            s.finish_job(job, root, JobStatus::Cancelled, 0, None)
                .unwrap(),
            0
        );
        assert_eq!(
            s.search("", LibrarySort::Title, false, 50, 0)
                .unwrap()
                .total,
            2
        );

        // Third scan completes seeing only `a`: `b` flagged missing, hidden by default.
        let job = s.begin_job(root).unwrap();
        s.record_batch(job, root, &[ScanEntry::Unchanged(id_a)])
            .unwrap();
        assert_eq!(
            s.finish_job(job, root, JobStatus::Completed, 0, None)
                .unwrap(),
            1
        );
        assert_eq!(
            s.search("", LibrarySort::Title, false, 50, 0)
                .unwrap()
                .total,
            1
        );
        let all = s.search("", LibrarySort::Title, true, 50, 0).unwrap();
        assert_eq!(all.total, 2);
        assert!(all.items.iter().any(|i| i.title == "b" && i.missing));
        let root_info = &s.roots().unwrap()[0];
        assert_eq!((root_info.item_count, root_info.missing_count), (1, 1));
        assert_eq!(root_info.last_scan.as_ref().unwrap().status, "completed");
    }

    #[test]
    fn missing_item_recovers_when_seen_again() {
        let d = dir("recover");
        let s = Store::open_in_memory().unwrap();
        let root = s.add_root(&d).unwrap().id;
        let a = file(&d.join("a.mkv"), 1);
        let job = s.begin_job(root).unwrap();
        s.record_batch(job, root, &[ScanEntry::Changed(a.clone())])
            .unwrap();
        s.finish_job(job, root, JobStatus::Completed, 0, None)
            .unwrap();
        let job = s.begin_job(root).unwrap();
        s.finish_job(job, root, JobStatus::Completed, 0, None)
            .unwrap();
        assert_eq!(
            s.search("", LibrarySort::Title, false, 50, 0)
                .unwrap()
                .total,
            0
        );
        let job = s.begin_job(root).unwrap();
        let id = s.known_file(&a.path).unwrap().unwrap().0;
        let r = s
            .record_batch(job, root, &[ScanEntry::Unchanged(id)])
            .unwrap();
        assert_eq!(r.updated, 1, "recovered item counts as updated");
        assert_eq!(
            s.search("", LibrarySort::Title, false, 50, 0)
                .unwrap()
                .total,
            1
        );
    }

    #[test]
    fn removing_root_detaches_items_but_keeps_progress() {
        let d = dir("remove");
        let s = Store::open_in_memory().unwrap();
        let root = s.add_root(&d).unwrap().id;
        let a = file(&d.join("a.mkv"), 1);
        let job = s.begin_job(root).unwrap();
        s.record_batch(job, root, &[ScanEntry::Changed(a.clone())])
            .unwrap();
        let id = s.known_file(&a.path).unwrap().unwrap().0;
        let p = SavedProgress {
            position_ms: 9_000,
            duration_ms: Some(600_000),
            completed: false,
        };
        s.save_progress(id, p).unwrap();
        assert!(s.remove_root(root).unwrap());
        assert_eq!(
            s.search("", LibrarySort::Title, true, 50, 0).unwrap().total,
            0
        );
        assert_eq!(s.load_progress(id).unwrap(), Some(p));
        assert_eq!(s.continue_watching(10).unwrap().len(), 1);
    }

    #[test]
    fn interrupted_jobs_are_marked() {
        let d = dir("interrupted");
        let s = Store::open_in_memory().unwrap();
        let root = s.add_root(&d).unwrap().id;
        s.begin_job(root).unwrap();
        assert_eq!(s.mark_interrupted_jobs().unwrap(), 1);
        assert_eq!(
            s.roots().unwrap()[0].last_scan.as_ref().unwrap().status,
            "interrupted"
        );
    }

    #[test]
    fn search_matches_prefixes_folders_and_diacritics() {
        let d = dir("search");
        let s = Store::open_in_memory().unwrap();
        let root = s.add_root(&d).unwrap().id;
        let files = [
            file(&d.join("Shows/Café Stories/Café.Stories.S01E02.mkv"), 1),
            file(&d.join("Movies/The Long Night.mp4"), 2),
            file(&d.join("Movies/Night Shift.mkv"), 3),
        ];
        let job = s.begin_job(root).unwrap();
        let entries: Vec<_> = files.iter().cloned().map(ScanEntry::Changed).collect();
        s.record_batch(job, root, &entries).unwrap();
        let titles = |q: &str| -> Vec<String> {
            s.search(q, LibrarySort::Title, false, 50, 0)
                .unwrap()
                .items
                .into_iter()
                .map(|i| i.title)
                .collect()
        };
        assert_eq!(titles("cafe s01"), ["Café.Stories.S01E02"]);
        assert_eq!(titles("nigh"), ["Night Shift", "The Long Night"]);
        assert_eq!(
            titles("movies"),
            ["Night Shift", "The Long Night"],
            "folder is searchable"
        );
        assert!(titles("zzz").is_empty());
        assert_eq!(titles("\")(*"), titles(""), "pure punctuation = list all");
    }

    #[test]
    fn continue_watching_orders_by_recency_and_skips_completed() {
        let d = dir("continue");
        let s = Store::open_in_memory().unwrap();
        let ids: Vec<_> = (0..3u8)
            .map(|i| {
                s.resolve_media(&file(&d.join(format!("{i}.mkv")), i))
                    .unwrap()
            })
            .collect();
        let p = |pos, completed| SavedProgress {
            position_ms: pos,
            duration_ms: Some(600_000),
            completed,
        };
        s.save_progress(ids[0], p(10_000, false)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        s.save_progress(ids[1], p(0, true)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        s.save_progress(ids[2], p(20_000, false)).unwrap();
        let cw = s.continue_watching(10).unwrap();
        assert_eq!(
            cw.iter().map(|i| i.id).collect::<Vec<_>>(),
            [ids[2], ids[0]]
        );
        std::fs::remove_file(d.join("0.mkv")).unwrap();
        assert!(s.continue_watching(10).unwrap()[1].missing);
    }

    /// LIB-02: 20 000 items; every search must stay well under the 100 ms
    /// interaction budget on this machine (debug build, so release is faster).
    #[test]
    fn search_20k_items_is_fast() {
        let s = Store::open_in_memory().unwrap();
        let d = dir("perf");
        let root = s.add_root(&d).unwrap().id;
        let job = s.begin_job(root).unwrap();
        let words = [
            "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
        ];
        let entries: Vec<ScanEntry> = (0..20_000)
            .map(|i| {
                ScanEntry::Changed(FileIdentity {
                    path: format!(
                        r"C:\lib\{}\{} {} {i:05}.mkv",
                        words[i % 8],
                        words[(i / 8) % 8],
                        words[(i / 64) % 8]
                    ),
                    size_bytes: 1000 + i as u64,
                    modified_ms: Some(0),
                    fingerprint: format!("fnv64:{i:016x}"),
                })
            })
            .collect();
        let t = Instant::now();
        for chunk in entries.chunks(500) {
            s.record_batch(job, root, chunk).unwrap();
        }
        println!("insert 20k: {:?}", t.elapsed());
        let mut worst = std::time::Duration::ZERO;
        for (q, sort) in [
            ("", LibrarySort::Title),
            ("", LibrarySort::RecentlyAdded),
            ("alpha", LibrarySort::Relevance),
            ("bravo char", LibrarySort::Relevance),
            ("00042", LibrarySort::Title),
            ("e", LibrarySort::Relevance),
        ] {
            let t = Instant::now();
            let page = s.search(q, sort, false, 100, 0).unwrap();
            let el = t.elapsed();
            println!("search {q:?} {sort:?}: {} hits in {el:?}", page.total);
            worst = worst.max(el);
            assert!(page.total > 0);
        }
        assert!(worst.as_millis() < 100, "worst search {worst:?}");
    }
}

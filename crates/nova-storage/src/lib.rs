//! SQLite persistence for NOVA.
//!
//! - Schema changes are ordered migrations tracked in `PRAGMA user_version`;
//!   each runs in a transaction. A database from a *newer* NOVA is refused
//!   rather than modified.
//! - WAL journal + `synchronous=NORMAL`: committed transactions survive an app
//!   crash; at most the last commit can be lost on power failure.
//! - Media identity follows "paths are locations": see [`identity`].

pub mod identity;

use identity::FileIdentity;
use nova_application::progress_service::{MediaId, ProgressRepository};
use nova_domain::progress::SavedProgress;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// Ordered schema migrations. Never edit a shipped entry; append a new one.
const MIGRATIONS: &[&str] = &[
    // 1: media identity + playback progress
    r#"
    CREATE TABLE media_item (
        id            INTEGER PRIMARY KEY,
        path          TEXT    NOT NULL UNIQUE,
        fingerprint   TEXT    NOT NULL,
        size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
        modified_ms   INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
    );
    CREATE INDEX media_item_fingerprint ON media_item(fingerprint);

    CREATE TABLE playback_progress (
        media_id      INTEGER PRIMARY KEY REFERENCES media_item(id) ON DELETE CASCADE,
        position_ms   INTEGER NOT NULL CHECK (position_ms >= 0),
        duration_ms   INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
        completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        updated_at_ms INTEGER NOT NULL
    );
    CREATE INDEX playback_progress_recent ON playback_progress(updated_at_ms DESC);
    "#,
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

#[derive(Debug)]
pub enum StoreError {
    Sqlite(rusqlite::Error),
    /// The database was written by a newer NOVA; it is left untouched.
    TooNew {
        found: i64,
        supported: i64,
    },
    Io(std::io::Error),
}

impl std::error::Error for StoreError {}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(e) => write!(f, "database error: {e}"),
            Self::TooNew { found, supported } => write!(
                f,
                "database schema v{found} is newer than this NOVA supports (v{supported})"
            ),
            Self::Io(e) => write!(f, "file error: {e}"),
        }
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e)
    }
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> Result<Self, StoreError> {
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.busy_timeout(std::time::Duration::from_secs(2))?;
        // Quick structural check: a corrupt file fails here, not mid-session.
        let ok: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
        if ok != "ok" {
            return Err(StoreError::Sqlite(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                Some(ok),
            )));
        }
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn schema_version(&self) -> Result<i64, StoreError> {
        Ok(self
            .lock()
            .query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    /// Resolves a file to its media id, recording moves and replacements:
    /// 1. same path, same content → same id;
    /// 2. same path, different content → same row, progress discarded;
    /// 3. new path, content matches a row whose file no longer exists → moved:
    ///    the row follows the file and keeps its progress;
    /// 4. otherwise a new row (copies of a file get separate ids).
    pub fn resolve_media(&self, file: &FileIdentity) -> Result<MediaId, StoreError> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let id = resolve_in(&tx, file)?;
        tx.commit()?;
        Ok(id)
    }

    pub fn load_progress(&self, media: MediaId) -> Result<Option<SavedProgress>, StoreError> {
        Ok(self
            .lock()
            .query_row(
                "SELECT position_ms, duration_ms, completed FROM playback_progress WHERE media_id = ?1",
                [media],
                |r| {
                    Ok(SavedProgress {
                        position_ms: r.get::<_, i64>(0)?.max(0) as u64,
                        duration_ms: r.get::<_, Option<i64>>(1)?.map(|d| d.max(0) as u64),
                        completed: r.get(2)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn save_progress(&self, media: MediaId, p: SavedProgress) -> Result<(), StoreError> {
        self.lock().execute(
            "INSERT INTO playback_progress (media_id, position_ms, duration_ms, completed, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(media_id) DO UPDATE SET
               position_ms = excluded.position_ms, duration_ms = excluded.duration_ms,
               completed = excluded.completed, updated_at_ms = excluded.updated_at_ms",
            params![media, p.position_ms as i64, p.duration_ms.map(|d| d as i64), p.completed, now_ms()],
        )?;
        Ok(())
    }

    pub fn media_path(&self, media: MediaId) -> Result<Option<String>, StoreError> {
        Ok(self
            .lock()
            .query_row("SELECT path FROM media_item WHERE id = ?1", [media], |r| {
                r.get(0)
            })
            .optional()?)
    }
}

fn resolve_in(tx: &Transaction<'_>, f: &FileIdentity) -> Result<MediaId, StoreError> {
    let now = now_ms();
    let by_path: Option<(MediaId, String)> = tx
        .query_row(
            "SELECT id, fingerprint FROM media_item WHERE path = ?1",
            [&f.path],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((id, fp)) = by_path {
        if fp != f.fingerprint {
            log::info!("media content changed at a known path; discarding its progress");
            tx.execute("DELETE FROM playback_progress WHERE media_id = ?1", [id])?;
        }
        tx.execute(
            "UPDATE media_item SET fingerprint = ?2, size_bytes = ?3, modified_ms = ?4, updated_at_ms = ?5
             WHERE id = ?1",
            params![id, f.fingerprint, f.size_bytes as i64, f.modified_ms, now],
        )?;
        return Ok(id);
    }

    let mut stmt = tx.prepare(
        "SELECT id, path FROM media_item WHERE fingerprint = ?1 AND size_bytes = ?2 ORDER BY id",
    )?;
    let candidates: Vec<(MediaId, String)> = stmt
        .query_map(params![f.fingerprint, f.size_bytes as i64], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<Result<_, _>>()?;
    drop(stmt);
    if let Some((id, _)) = candidates
        .into_iter()
        .find(|(_, old)| !Path::new(old).exists())
    {
        log::info!("media moved; carrying its progress to the new location");
        tx.execute(
            "UPDATE media_item SET path = ?2, modified_ms = ?3, updated_at_ms = ?4 WHERE id = ?1",
            params![id, f.path, f.modified_ms, now],
        )?;
        return Ok(id);
    }

    tx.execute(
        "INSERT INTO media_item (path, fingerprint, size_bytes, modified_ms, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![f.path, f.fingerprint, f.size_bytes as i64, f.modified_ms, now],
    )?;
    Ok(tx.last_insert_rowid())
}

fn migrate(conn: &mut Connection) -> Result<(), StoreError> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if current > SCHEMA_VERSION {
        return Err(StoreError::TooNew {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = i as i64 + 1;
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
        log::info!("database migrated to schema v{version}");
    }
    Ok(())
}

impl ProgressRepository for Store {
    fn identify(&self, path: &str) -> Result<MediaId, String> {
        let file = FileIdentity::from_path(Path::new(path)).map_err(|e| e.to_string())?;
        self.resolve_media(&file).map_err(|e| e.to_string())
    }

    fn load(&self, media: MediaId) -> Result<Option<SavedProgress>, String> {
        self.load_progress(media).map_err(|e| e.to_string())
    }

    fn save(&self, media: MediaId, progress: SavedProgress) -> Result<(), String> {
        self.save_progress(media, progress)
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join("nova-storage-tests").join(name);
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn write(p: &Path, seed: u8) -> FileIdentity {
        let data: Vec<u8> = (0..200_000u32)
            .map(|i| (i as u8).wrapping_mul(seed))
            .collect();
        std::fs::write(p, data).unwrap();
        FileIdentity::from_path(p).unwrap()
    }

    fn progress(pos: u64) -> SavedProgress {
        SavedProgress {
            position_ms: pos,
            duration_ms: Some(600_000),
            completed: false,
        }
    }

    #[test]
    fn migrates_fresh_db_and_reopens_idempotently() {
        let d = dir("migrate");
        let db = d.join("nova.sqlite3");
        let s = Store::open(&db).unwrap();
        assert_eq!(s.schema_version().unwrap(), SCHEMA_VERSION);
        drop(s);
        let s = Store::open(&db).unwrap();
        assert_eq!(s.schema_version().unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn refuses_newer_schema_without_modifying_it() {
        let d = dir("too-new");
        let db = d.join("nova.sqlite3");
        {
            let c = Connection::open(&db).unwrap();
            c.pragma_update(None, "user_version", 99).unwrap();
        }
        match Store::open(&db) {
            Err(StoreError::TooNew { found: 99, .. }) => {}
            other => panic!("expected TooNew, got {:?}", other.err()),
        }
        let c = Connection::open(&db).unwrap();
        let v: i64 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 99);
    }

    #[test]
    fn rejects_corrupt_file() {
        let d = dir("corrupt");
        let db = d.join("nova.sqlite3");
        std::fs::write(&db, vec![0x42u8; 8192]).unwrap();
        assert!(Store::open(&db).is_err());
    }

    #[test]
    fn progress_round_trips_and_survives_reopen() {
        let d = dir("roundtrip");
        let db = d.join("nova.sqlite3");
        let f = write(&d.join("movie.mkv"), 3);
        let id = {
            let s = Store::open(&db).unwrap();
            let id = s.resolve_media(&f).unwrap();
            assert_eq!(s.load_progress(id).unwrap(), None);
            s.save_progress(id, progress(1_000)).unwrap();
            s.save_progress(id, progress(42_000)).unwrap();
            id
        };
        let s = Store::open(&db).unwrap();
        assert_eq!(s.resolve_media(&f).unwrap(), id);
        assert_eq!(s.load_progress(id).unwrap(), Some(progress(42_000)));
    }

    #[test]
    fn moved_file_keeps_progress() {
        let d = dir("moved");
        let s = Store::open_in_memory().unwrap();
        let old = d.join("old.mkv");
        let f = write(&old, 5);
        let id = s.resolve_media(&f).unwrap();
        s.save_progress(id, progress(90_000)).unwrap();

        let new = d.join("renamed.mkv");
        std::fs::rename(&old, &new).unwrap();
        let moved = FileIdentity::from_path(&new).unwrap();
        assert_eq!(s.resolve_media(&moved).unwrap(), id);
        assert_eq!(s.load_progress(id).unwrap(), Some(progress(90_000)));
        assert_eq!(s.media_path(id).unwrap().unwrap(), moved.path);
    }

    #[test]
    fn copies_get_separate_identities() {
        let d = dir("copies");
        let s = Store::open_in_memory().unwrap();
        let a = write(&d.join("a.mkv"), 7);
        let b = write(&d.join("b.mkv"), 7);
        assert_eq!(a.fingerprint, b.fingerprint);
        let ia = s.resolve_media(&a).unwrap();
        s.save_progress(ia, progress(10_000)).unwrap();
        let ib = s.resolve_media(&b).unwrap();
        assert_ne!(ia, ib, "both files exist, so b is a copy, not a move");
        assert_eq!(s.load_progress(ib).unwrap(), None);
    }

    #[test]
    fn replaced_content_at_same_path_discards_progress() {
        let d = dir("replaced");
        let s = Store::open_in_memory().unwrap();
        let p = d.join("episode.mkv");
        let id = s.resolve_media(&write(&p, 9)).unwrap();
        s.save_progress(id, progress(30_000)).unwrap();
        let replaced = write(&p, 11);
        assert_eq!(s.resolve_media(&replaced).unwrap(), id);
        assert_eq!(s.load_progress(id).unwrap(), None);
    }

    #[test]
    fn schema_constraints_reject_bad_rows() {
        let s = Store::open_in_memory().unwrap();
        let c = s.lock();
        assert!(c
            .execute(
                "INSERT INTO playback_progress (media_id, position_ms, completed, updated_at_ms) VALUES (999, 1, 0, 0)",
                [],
            )
            .is_err(), "foreign key enforced");
        c.execute(
            "INSERT INTO media_item (path, fingerprint, size_bytes, created_at_ms, updated_at_ms) VALUES ('x','f',1,0,0)",
            [],
        )
        .unwrap();
        assert!(c
            .execute(
                "INSERT INTO playback_progress (media_id, position_ms, completed, updated_at_ms) VALUES (1, -5, 0, 0)",
                [],
            )
            .is_err(), "negative position rejected");
    }
}

//! Engine-measured media facts (thumbnails, duration), preferences, playlists,
//! and history clearing.

use crate::{Store, StoreError, now_ms};
use nova_application::progress_service::MediaId;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThumbState {
    Ready = 1,
    None = 2,
}

/// Known preference keys and their allowed values. Anything else is rejected,
/// so a corrupted or hostile value can never reach the engine or the UI.
pub const PREFERENCES: &[(&str, &[&str], &str)] = &[
    ("theme", &["system", "light", "dark"], "system"),
    ("controls", &["comfortable", "compact"], "comfortable"),
    ("timeDisplay", &["elapsed", "remaining"], "elapsed"),
    ("hwdec", &["auto", "off"], "auto"),
    ("resume", &["on", "off"], "on"),
    ("autoHide", &["on", "off"], "on"),
    ("wheel", &["volume", "seek", "none"], "volume"),
    ("click", &["pause", "none"], "pause"),
    ("dblclick", &["fullscreen", "none"], "fullscreen"),
    // Look for a new release on GitHub at start-up ("manual": only when asked).
    ("updates", &["auto", "manual"], "auto"),
    // Timeline across the full deck, or short and inline between the controls.
    ("timelineLayout", &["wide", "compact"], "wide"),
    // Timeline dragging: accurate frames while the engine keeps up ("auto"),
    // always accurate, or always keyframes (fastest, least precise).
    ("scrub", &["auto", "accurate", "fast"], "auto"),
    // Ctrl + wheel over the picture.
    (
        "ctrlWheel",
        &["subtitleSize", "volume", "none"],
        "subtitleSize",
    ),
    // Subtitle size, percent of the authored size, in steps of 10.
    (
        "subScale",
        &[
            "50", "60", "70", "80", "90", "100", "110", "120", "130", "140", "150", "160", "170",
            "180", "190", "200", "210", "220", "230", "240", "250", "260", "270", "280", "290",
            "300",
        ],
        "100",
    ),
];

/// Free-form preferences validated structurally instead of by enumeration.
pub const KEYMAP_KEY: &str = "keymap";
const KEYMAP_MAX_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSummary {
    pub id: i64,
    pub name: String,
    pub item_count: i64,
    /// Sum of known durations; `None` when no item duration is known.
    pub known_duration_ms: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub path: String,
    pub title: String,
}

impl Store {
    /// Media still needing a poster frame: watched items first, then newest.
    pub fn pending_thumbnails(&self, limit: i64) -> Result<Vec<(MediaId, String)>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT m.id, m.path FROM media_item m LEFT JOIN playback_progress p ON p.media_id = m.id
             WHERE m.thumb_state = 0 AND m.missing = 0
             ORDER BY (p.media_id IS NULL), m.added_to_library_ms DESC, m.id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn set_media_facts(
        &self,
        id: MediaId,
        thumb: ThumbState,
        duration_ms: Option<u64>,
        width: Option<u32>,
        height: Option<u32>,
    ) -> Result<(), StoreError> {
        self.lock().execute(
            "UPDATE media_item SET thumb_state = ?2, duration_ms = coalesce(?3, duration_ms),
                    width = coalesce(?4, width), height = coalesce(?5, height) WHERE id = ?1",
            params![
                id,
                thumb as i64,
                duration_ms.map(|d| d as i64),
                width,
                height
            ],
        )?;
        Ok(())
    }

    /// All preferences with defaults filled in.
    pub fn preferences(&self) -> Result<BTreeMap<String, String>, StoreError> {
        let mut out: BTreeMap<String, String> = PREFERENCES
            .iter()
            .map(|(k, _, d)| ((*k).to_owned(), (*d).to_owned()))
            .collect();
        out.insert(KEYMAP_KEY.to_owned(), "{}".to_owned());
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT key, value FROM preference")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (k, v) = row?;
            if validate_preference(&k, &v) {
                out.insert(k, v);
            }
        }
        Ok(out)
    }

    pub fn set_preference(&self, key: &str, value: &str) -> Result<bool, StoreError> {
        if !validate_preference(key, value) {
            return Ok(false);
        }
        self.lock().execute(
            "INSERT INTO preference (key, value, updated_at_ms) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms",
            params![key, value, now_ms()],
        )?;
        Ok(true)
    }

    /// Forgets all watch progress (Continue Watching, resume positions).
    pub fn clear_history(&self) -> Result<usize, StoreError> {
        Ok(self.lock().execute("DELETE FROM playback_progress", [])?)
    }

    pub fn playlists(&self) -> Result<Vec<PlaylistSummary>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT pl.id, pl.name, count(pi.position),
                    (SELECT sum(m.duration_ms) FROM playlist_item x JOIN media_item m ON m.path = x.path
                      WHERE x.playlist_id = pl.id),
                    pl.updated_at_ms
             FROM playlist pl LEFT JOIN playlist_item pi ON pi.playlist_id = pl.id
             GROUP BY pl.id ORDER BY pl.updated_at_ms DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(PlaylistSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                item_count: r.get(2)?,
                known_duration_ms: r.get(3)?,
                updated_at_ms: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn create_playlist(
        &self,
        name: &str,
        entries: &[PlaylistEntry],
    ) -> Result<i64, StoreError> {
        let name = name.trim();
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let now = now_ms();
        tx.execute(
            "INSERT INTO playlist (name, created_at_ms, updated_at_ms) VALUES (?1, ?2, ?2)",
            params![name, now],
        )?;
        let id = tx.last_insert_rowid();
        for (i, e) in entries.iter().enumerate() {
            tx.execute(
                "INSERT INTO playlist_item (playlist_id, position, path, title) VALUES (?1, ?2, ?3, ?4)",
                params![id, i as i64, e.path, e.title],
            )?;
        }
        tx.commit()?;
        Ok(id)
    }

    pub fn rename_playlist(&self, id: i64, name: &str) -> Result<bool, StoreError> {
        Ok(self.lock().execute(
            "UPDATE playlist SET name = ?2, updated_at_ms = ?3 WHERE id = ?1",
            params![id, name.trim(), now_ms()],
        )? > 0)
    }

    pub fn delete_playlist(&self, id: i64) -> Result<bool, StoreError> {
        Ok(self
            .lock()
            .execute("DELETE FROM playlist WHERE id = ?1", [id])?
            > 0)
    }

    pub fn playlist_entries(&self, id: i64) -> Result<Option<Vec<PlaylistEntry>>, StoreError> {
        let conn = self.lock();
        let exists: Option<i64> = conn
            .query_row("SELECT id FROM playlist WHERE id = ?1", [id], |r| r.get(0))
            .optional()?;
        if exists.is_none() {
            return Ok(None);
        }
        let mut stmt = conn.prepare(
            "SELECT path, title FROM playlist_item WHERE playlist_id = ?1 ORDER BY position",
        )?;
        let rows = stmt.query_map([id], |r| {
            Ok(PlaylistEntry {
                path: r.get(0)?,
                title: r.get(1)?,
            })
        })?;
        Ok(Some(rows.collect::<Result<_, _>>()?))
    }

    /// Engine-measured duration for a path, when the thumbnail job has seen it.
    pub fn durations_for(&self, paths: &[String]) -> Result<BTreeMap<String, u64>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT duration_ms FROM media_item WHERE path = ?1")?;
        let mut out = BTreeMap::new();
        for p in paths {
            if let Some(Some(d)) = stmt
                .query_row([p], |r| r.get::<_, Option<i64>>(0))
                .optional()?
            {
                out.insert(p.clone(), d.max(0) as u64);
            }
        }
        Ok(out)
    }
}

pub fn validate_preference(key: &str, value: &str) -> bool {
    if key == KEYMAP_KEY {
        return validate_keymap(value);
    }
    PREFERENCES
        .iter()
        .any(|(k, allowed, _)| *k == key && allowed.contains(&value))
}

/// A keymap is a JSON object: action id -> list of key chords
/// (e.g. `{"seek.forward":["ArrowRight","L"]}`). Bounded in size and shape so
/// stored data can never be used to smuggle anything else.
pub fn validate_keymap(value: &str) -> bool {
    if value.len() > KEYMAP_MAX_BYTES {
        return false;
    }
    let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(value)
    else {
        return false;
    };
    map.len() <= 200
        && map.iter().all(|(action, chords)| {
            action.len() <= 48
                && action.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
                && matches!(chords, serde_json::Value::Array(list) if list.len() <= 6
                    && list.iter().all(|c| matches!(c, serde_json::Value::String(s) if !s.is_empty() && s.len() <= 40)))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::FileIdentity;

    #[test]
    fn preferences_have_defaults_and_reject_unknown_values() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.preferences().unwrap()["theme"], "system");
        assert!(s.set_preference("theme", "dark").unwrap());
        assert!(!s.set_preference("theme", "neon").unwrap());
        assert!(!s.set_preference("evil", "x").unwrap());
        assert_eq!(s.preferences().unwrap()["theme"], "dark");
        // A bad row written behind our back is ignored, not trusted.
        s.lock()
            .execute("INSERT INTO preference VALUES ('hwdec', 'rm -rf', 0) ON CONFLICT(key) DO UPDATE SET value = 'rm -rf'", [])
            .unwrap();
        assert_eq!(s.preferences().unwrap()["hwdec"], "auto");
    }

    #[test]
    fn keymap_is_validated_structurally() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.preferences().unwrap()["keymap"], "{}");
        assert!(
            s.set_preference("keymap", r#"{"seek.forward":["ArrowRight","Shift+L"]}"#)
                .unwrap()
        );
        assert!(
            !s.set_preference("keymap", r#"{"seek.forward":"ArrowRight"}"#)
                .unwrap()
        );
        assert!(!s.set_preference("keymap", r#"{"bad key!":["A"]}"#).unwrap());
        assert!(!s.set_preference("keymap", "not json").unwrap());
        assert!(
            !s.set_preference("keymap", &format!(r#"{{"a":["{}"]}}"#, "x".repeat(41)))
                .unwrap()
        );
        assert_eq!(s.preferences().unwrap()["wheel"], "volume");
        assert_eq!(s.preferences().unwrap()["subScale"], "100");
        assert!(validate_preference("subScale", "130"));
        assert!(!validate_preference("subScale", "135"));
        assert!(!validate_preference("subScale", "310"));
        assert!(validate_preference("ctrlWheel", "subtitleSize"));
    }

    #[test]
    fn playlists_round_trip_and_cascade() {
        let s = Store::open_in_memory().unwrap();
        let e = |p: &str| PlaylistEntry {
            path: p.into(),
            title: p.into(),
        };
        let id = s
            .create_playlist("  Evening  ", &[e("C:/a.mkv"), e("C:/b.mkv")])
            .unwrap();
        let list = s.playlists().unwrap();
        assert_eq!((list[0].name.as_str(), list[0].item_count), ("Evening", 2));
        assert_eq!(s.playlist_entries(id).unwrap().unwrap()[1].path, "C:/b.mkv");
        assert!(s.rename_playlist(id, "Late").unwrap());
        assert!(s.delete_playlist(id).unwrap());
        assert_eq!(s.playlist_entries(id).unwrap(), None);
        let n: i64 = s
            .lock()
            .query_row("SELECT count(*) FROM playlist_item", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
        assert!(
            s.create_playlist("", &[]).is_err(),
            "empty name rejected by schema"
        );
    }

    #[test]
    fn thumbnails_queue_and_reset_on_content_change() {
        let d = std::env::temp_dir().join("nova-extras-thumbs");
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let p = d.join("a.mkv");
        std::fs::write(&p, vec![1u8; 1000]).unwrap();
        let s = Store::open_in_memory().unwrap();
        let id = s
            .resolve_media(&FileIdentity::from_path(&p).unwrap())
            .unwrap();
        assert_eq!(s.pending_thumbnails(10).unwrap().len(), 1);
        s.set_media_facts(id, ThumbState::Ready, Some(90_000), Some(1920), Some(1080))
            .unwrap();
        assert!(s.pending_thumbnails(10).unwrap().is_empty());
        let path = s.media_path(id).unwrap().unwrap();
        assert_eq!(
            s.durations_for(&[path]).unwrap().values().next(),
            Some(&90_000)
        );
        std::fs::write(&p, vec![2u8; 1000]).unwrap();
        s.resolve_media(&FileIdentity::from_path(&p).unwrap())
            .unwrap();
        assert_eq!(
            s.pending_thumbnails(10).unwrap().len(),
            1,
            "new content needs a new frame"
        );
    }

    #[test]
    fn clear_history_removes_progress() {
        let s = Store::open_in_memory().unwrap();
        s.lock()
            .execute_batch(
                "INSERT INTO media_item (path, fingerprint, size_bytes, created_at_ms, updated_at_ms) VALUES ('x','f',1,0,0);
                 INSERT INTO playback_progress (media_id, position_ms, completed, updated_at_ms) VALUES (1, 5000, 0, 0);",
            )
            .unwrap();
        assert_eq!(s.clear_history().unwrap(), 1);
        assert!(s.continue_watching(5).unwrap().is_empty());
    }
}

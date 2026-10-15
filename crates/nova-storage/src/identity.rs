//! File identity: where a file is (path) versus what it is (fingerprint).
//!
//! Paths are locations, not identities. The fingerprint is a cheap content
//! sample — FNV-1a 64 over the size plus the first and last 64 KiB — that
//! survives moves and renames without reading whole multi-GB files. It is a
//! heuristic: two files with identical size, head and tail would collide.
//! FNV is used because it is stable across Rust versions and platforms
//! (unlike `DefaultHasher`), which matters for data persisted on disk.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const SAMPLE_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileIdentity {
    /// Canonical absolute path (Windows `\\?\` prefix stripped).
    pub path: String,
    pub size_bytes: u64,
    pub modified_ms: Option<i64>,
    pub fingerprint: String,
}

struct Fnv64(u64);

impl Fnv64 {
    fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
    fn update(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.0 ^= u64::from(*b);
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
}

pub fn canonical_path(path: &Path) -> std::io::Result<PathBuf> {
    let c = std::fs::canonicalize(path)?;
    let s = c.to_string_lossy();
    Ok(match s.strip_prefix(r"\\?\UNC\") {
        Some(rest) => PathBuf::from(format!(r"\\{rest}")),
        None => PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s)),
    })
}

impl FileIdentity {
    pub fn from_path(path: &Path) -> std::io::Result<Self> {
        let canonical = canonical_path(path)?;
        let mut file = File::open(&canonical)?;
        let meta = file.metadata()?;
        if !meta.is_file() {
            return Err(std::io::Error::other("not a regular file"));
        }
        let size = meta.len();
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);

        let mut h = Fnv64::new();
        h.update(&size.to_le_bytes());
        let mut buf = vec![0u8; SAMPLE_BYTES as usize];
        let n = read_up_to(&mut file, &mut buf)?;
        h.update(&buf[..n]);
        if size > SAMPLE_BYTES * 2 {
            file.seek(SeekFrom::Start(size - SAMPLE_BYTES))?;
            let n = read_up_to(&mut file, &mut buf)?;
            h.update(&buf[..n]);
        } else if size > SAMPLE_BYTES {
            let n = read_up_to(&mut file, &mut buf)?;
            h.update(&buf[..n]);
        }
        Ok(Self {
            path: canonical.to_string_lossy().into_owned(),
            size_bytes: size,
            modified_ms,
            fingerprint: format!("fnv64:{:016x}", h.0),
        })
    }
}

fn read_up_to(file: &mut File, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        let n = file.read(&mut buf[total..])?;
        if n == 0 {
            break;
        }
        total += n;
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str, bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join("nova-identity-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        std::fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn fnv_matches_reference_vectors() {
        // Published FNV-1a 64 test vectors.
        let mut h = Fnv64::new();
        assert_eq!(h.0, 0xcbf29ce484222325);
        h.update(b"a");
        assert_eq!(h.0, 0xaf63dc4c8601ec8c);
        let mut h = Fnv64::new();
        h.update(b"foobar");
        assert_eq!(h.0, 0x85944171f73967e8);
    }

    #[test]
    fn same_content_same_fingerprint_regardless_of_path() {
        let data: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let a = FileIdentity::from_path(&tmp("a.bin", &data)).unwrap();
        let b = FileIdentity::from_path(&tmp("b.bin", &data)).unwrap();
        assert_eq!(a.fingerprint, b.fingerprint);
        assert_ne!(a.path, b.path);
        assert_eq!(a.size_bytes, 300_000);
        assert!(!a.path.starts_with(r"\\?\"));
    }

    #[test]
    fn different_head_tail_or_size_changes_fingerprint() {
        let data: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let base = FileIdentity::from_path(&tmp("base.bin", &data)).unwrap();
        let mut tail = data.clone();
        *tail.last_mut().unwrap() ^= 0xff;
        let mut head = data.clone();
        head[0] ^= 0xff;
        let shorter = &data[..299_999];
        for (name, bytes) in [
            ("tail.bin", &tail[..]),
            ("head.bin", &head[..]),
            ("short.bin", shorter),
        ] {
            let other = FileIdentity::from_path(&tmp(name, bytes)).unwrap();
            assert_ne!(base.fingerprint, other.fingerprint, "{name}");
        }
    }

    #[test]
    fn small_and_empty_files_work() {
        let a = FileIdentity::from_path(&tmp("empty.bin", b"")).unwrap();
        let b = FileIdentity::from_path(&tmp("tiny.bin", b"x")).unwrap();
        assert_ne!(a.fingerprint, b.fingerprint);
        assert!(
            FileIdentity::from_path(&std::env::temp_dir().join("nova-missing-xyz.bin")).is_err()
        );
    }
}

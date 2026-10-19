//! Files handed to NOVA by Windows: the first launch's arguments and, through
//! the single-instance plugin, every later launch's arguments.
//!
//! A second `nova-desktop.exe` (Explorer "Open with", a file association, a
//! terminal) exits at once and forwards its arguments here. Paths that arrive
//! before the frontend asked for them are kept until it does.

use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const OPEN_EVENT: &str = "launch://open";

/// Media files among `args` (the program name already removed). Relative
/// paths resolve against `cwd`, which for a forwarded launch is the *second*
/// process's working directory, not ours. Options (`--x`) and anything that is
/// not an existing file are dropped; duplicates keep their first position.
pub fn media_paths(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for arg in args {
        if arg.to_string_lossy().starts_with("--") {
            continue;
        }
        let p = PathBuf::from(arg);
        let p = if p.is_absolute() { p } else { cwd.join(p) };
        if !p.is_file() {
            continue;
        }
        let Ok(abs) = std::path::absolute(&p) else {
            continue;
        };
        let s = abs.display().to_string();
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

#[derive(Default)]
pub struct Pending(Mutex<(bool, Vec<String>)>);

#[derive(Clone, Serialize)]
struct Opened {
    paths: Vec<String>,
}

impl Pending {
    /// Called by the frontend once it listens: this launch's files plus any
    /// forwarded before now. Later forwards are emitted as `launch://open`.
    pub fn take(&self) -> Vec<String> {
        let cwd = std::env::current_dir().unwrap_or_default();
        let mut paths = media_paths(std::env::args_os().skip(1), &cwd);
        let mut g = self.0.lock().unwrap();
        g.0 = true;
        for p in g.1.drain(..) {
            if !paths.contains(&p) {
                paths.push(p);
            }
        }
        paths
    }

    /// Holds `paths` until the frontend is ready; returns them if it already is.
    fn push(&self, paths: Vec<String>) -> Option<Vec<String>> {
        let mut g = self.0.lock().unwrap();
        if !g.0 {
            g.1.extend(paths);
            None
        } else {
            Some(paths).filter(|p| !p.is_empty())
        }
    }
}

/// Single-instance callback: bring the window forward and pass the files on.
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    let paths = media_paths(
        argv.into_iter().skip(1).map(OsString::from),
        Path::new(&cwd),
    );
    if let Some(paths) = app.state::<Pending>().push(paths) {
        let _ = app.emit(OPEN_EVENT, Opened { paths });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("nova-launch-{}", std::process::id()));
        std::fs::create_dir_all(d.join("Films (2026) — ü")).unwrap();
        for f in ["a.mp4", "b c.mkv", "Films (2026) — ü/Ünïcode 映画.webm"] {
            std::fs::write(d.join(f), b"x").unwrap();
        }
        d
    }

    fn os(v: &[&str]) -> Vec<OsString> {
        v.iter().map(OsString::from).collect()
    }

    #[test]
    fn keeps_existing_files_resolved_against_the_callers_cwd() {
        let d = dir();
        let got = media_paths(
            os(&["a.mp4", "b c.mkv", "Films (2026) — ü/Ünïcode 映画.webm"]),
            &d,
        );
        assert_eq!(got.len(), 3);
        assert!(got[0].ends_with("a.mp4") && Path::new(&got[0]).is_absolute());
        assert!(got[1].ends_with("b c.mkv"));
        assert!(got[2].ends_with("Ünïcode 映画.webm"));
    }

    #[test]
    fn absolute_paths_ignore_cwd_and_order_is_kept() {
        let d = dir();
        let b = d.join("b c.mkv").display().to_string();
        let a = d.join("a.mp4").display().to_string();
        let got = media_paths(os(&[&b, &a]), Path::new(r"C:\does-not-matter"));
        assert_eq!(got, vec![b, a]);
    }

    #[test]
    fn drops_options_missing_files_folders_and_duplicates() {
        let d = dir();
        let got = media_paths(
            os(&[
                "--register-file-types",
                "missing.mp4",
                ".",
                "a.mp4",
                "a.mp4",
                "./a.mp4",
            ]),
            &d,
        );
        assert_eq!(got.len(), 1, "{got:?}");
    }

    #[test]
    fn forwards_wait_for_the_frontend_then_flow_through() {
        let p = Pending::default();
        assert_eq!(p.push(vec!["x".into()]), None);
        assert_eq!(p.push(vec!["y".into()]), None);
        let first = p.take();
        assert_eq!(&first[first.len() - 2..], ["x", "y"]);
        assert_eq!(p.push(vec!["z".into()]), Some(vec!["z".into()]));
        assert_eq!(p.push(vec![]), None);
        assert!(
            p.take().iter().all(|s| s != "x"),
            "held paths are handed over once"
        );
    }

    #[test]
    fn nothing_given_means_nothing_opened() {
        assert!(media_paths(Vec::<OsString>::new(), &dir()).is_empty());
    }
}

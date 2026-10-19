//! Windows file-type registration: NOVA in "Open with" and in Settings ›
//! Default apps, without ever taking a default.
//!
//! What is written (per user, HKCU, no elevation):
//! - ProgIDs `NOVA.Video`, `NOVA.Audio`, `NOVA.Subtitle` with an open verb.
//! - `.ext\OpenWithProgids` values, so NOVA is listed under "Open with".
//! - `Applications\nova-desktop.exe` with `SupportedTypes` and a friendly name.
//! - `Capabilities` plus a `RegisteredApplications` entry, so Windows offers
//!   NOVA as a default for video and audio types.
//!
//! What is never written: the `.ext` default value or `UserChoice`. Windows
//! decides defaults; the user picks NOVA in Settings or "Always use this app".
//! Unregistering deletes only the keys and values listed in [`owned`].
//!
//! The installer runs `nova-desktop.exe --register-file-types` after install
//! and `--unregister-file-types` before uninstall; Settings › Windows has a
//! repair button that registers again.

pub const APP_NAME: &str = "NOVA";

/// Offered as defaults. Every entry is a format the compatibility harness
/// verified or the engine audit lists (docs/compat/README.md).
pub const VIDEO: &[&str] = &[
    "mp4", "m4v", "mkv", "webm", "mov", "avi", "wmv", "asf", "flv", "f4v", "m2ts", "mts", "m2t",
    "mpg", "mpeg", "vob", "ogv", "3gp", "3g2", "mxf", "dv", "divx",
];
pub const AUDIO: &[&str] = &[
    "mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "aif", "aiff", "ac3", "eac3", "dts",
    "mka",
];
/// "Open with" only: a subtitle file alone is not something to play, so NOVA
/// is never offered as its default. Opened while a video plays, it is added.
pub const SUBTITLE: &[&str] = &["srt", "ass", "ssa", "vtt"];

const KINDS: [(&str, &str, &[&str], bool); 3] = [
    ("NOVA.Video", "Video file", VIDEO, true),
    ("NOVA.Audio", "Audio file", AUDIO, true),
    ("NOVA.Subtitle", "Subtitle file", SUBTITLE, false),
];

/// (key, value name, data); an empty name is the key's default value.
pub type Write = (String, String, String);

fn capabilities(root: &str) -> String {
    format!(r"{root}\SNOWBROS\NOVA\Capabilities")
}

/// Every registry write, relative to HKCU. `root` is `Software` in real use.
pub fn plan(root: &str, exe: &str) -> Vec<Write> {
    let classes = format!(r"{root}\Classes");
    let exe_name = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let open = format!("\"{exe}\" \"%1\"");
    let icon = format!("\"{exe}\",0");
    let caps = capabilities(root);
    let app = format!(r"{classes}\Applications\{exe_name}");
    let w = |k: &str, n: &str, v: &str| (k.to_owned(), n.to_owned(), v.to_owned());
    let mut out = vec![
        w(&app, "FriendlyAppName", APP_NAME),
        w(&format!(r"{app}\DefaultIcon"), "", &icon),
        w(&format!(r"{app}\shell\open"), "MultiSelectModel", "Player"),
        w(&format!(r"{app}\shell\open\command"), "", &open),
        w(&caps, "ApplicationName", APP_NAME),
        w(
            &caps,
            "ApplicationDescription",
            "A private, open-source media player by SNOWBROS",
        ),
        w(&caps, "ApplicationIcon", &icon),
        w(&format!(r"{root}\RegisteredApplications"), APP_NAME, &caps),
    ];
    for (progid, desc, exts, offer_default) in KINDS {
        let pk = format!(r"{classes}\{progid}");
        out.push(w(&pk, "", desc));
        out.push(w(&pk, "FriendlyTypeName", desc));
        out.push(w(&format!(r"{pk}\DefaultIcon"), "", &icon));
        // Player: one launch receives every selected file, however many.
        out.push(w(
            &format!(r"{pk}\shell\open"),
            "MultiSelectModel",
            "Player",
        ));
        out.push(w(&format!(r"{pk}\shell\open\command"), "", &open));
        for ext in exts {
            out.push(w(&format!(r"{classes}\.{ext}\OpenWithProgids"), progid, ""));
            out.push(w(&format!(r"{app}\SupportedTypes"), &format!(".{ext}"), ""));
            if offer_default {
                out.push(w(
                    &format!(r"{caps}\FileAssociations"),
                    &format!(".{ext}"),
                    progid,
                ));
            }
        }
    }
    out
}

/// Keys NOVA deletes whole, and single values it deletes inside shared keys.
pub fn owned(root: &str, exe: &str) -> (Vec<String>, Vec<(String, String)>) {
    let classes = format!(r"{root}\Classes");
    let exe_name = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let mut keys = vec![
        format!(r"{classes}\Applications\{exe_name}"),
        capabilities(root),
    ];
    let mut values = vec![(
        format!(r"{root}\RegisteredApplications"),
        APP_NAME.to_owned(),
    )];
    for (progid, _, exts, _) in KINDS {
        keys.push(format!(r"{classes}\{progid}"));
        values.extend(exts.iter().map(|e| {
            (
                format!(r"{classes}\.{e}\OpenWithProgids"),
                progid.to_owned(),
            )
        }));
    }
    (keys, values)
}

#[cfg(windows)]
mod apply {
    use std::io;
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    pub fn register(root: &str, exe: &str) -> io::Result<()> {
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        for (k, n, v) in super::plan(root, exe) {
            hk.create_subkey(&k)?.0.set_value(&n, &v)?;
        }
        changed();
        Ok(())
    }

    pub fn unregister(root: &str, exe: &str) -> io::Result<()> {
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        let (keys, values) = super::owned(root, exe);
        let gone = |r: io::Result<()>| match r {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
        for (k, n) in values {
            if let Ok(key) = hk.open_subkey_with_flags(&k, winreg::enums::KEY_SET_VALUE) {
                gone(key.delete_value(&n))?;
            }
        }
        for k in keys {
            gone(hk.delete_subkey_all(&k))?;
        }
        changed();
        Ok(())
    }

    /// Tells Explorer to re-read associations (SHCNE_ASSOCCHANGED).
    fn changed() {
        use windows_sys::Win32::UI::Shell::{SHCNE_ASSOCCHANGED, SHCNF_IDLIST, SHChangeNotify};
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED as i32,
                SHCNF_IDLIST,
                std::ptr::null(),
                std::ptr::null(),
            )
        };
    }
}
#[cfg(windows)]
pub use apply::{register, unregister};

/// `--register-file-types` / `--unregister-file-types`: run by the installer,
/// then exit without starting the app. Returns the exit code if one ran.
pub fn run_cli_action() -> Option<i32> {
    let flag = std::env::args().nth(1)?;
    let register = match flag.as_str() {
        "--register-file-types" => true,
        "--unregister-file-types" => false,
        _ => return None,
    };
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().ok()?.display().to_string();
        let r = if register {
            self::register("Software", &exe)
        } else {
            self::unregister("Software", &exe)
        };
        Some(r.map_or(1, |_| 0))
    }
    #[cfg(not(windows))]
    {
        let _ = register;
        Some(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Played when opened in NOVA but deliberately not registered: `.ts` is also
    /// TypeScript, and the rest are raw streams or engineering formats that
    /// nobody double-clicks expecting a player.
    pub const NOT_REGISTERED: &[&str] = &["ts", "gxf", "y4m", "alac", "thd"];

    const EXE: &str = r"C:\Users\x\AppData\Local\NOVA\nova-desktop.exe";

    #[test]
    fn never_writes_an_extension_default_or_user_choice() {
        for (k, n, _) in plan("Software", EXE) {
            let leaf = k.rsplit('\\').next().unwrap();
            assert!(
                !(leaf.starts_with('.') && n.is_empty()),
                "would take a default: {k}"
            );
            assert!(!k.contains("UserChoice") && !k.contains("FileExts"), "{k}");
        }
    }

    #[test]
    fn uninstall_removes_exactly_what_install_wrote() {
        let (keys, values) = owned("Software", EXE);
        for (k, n, _) in plan("Software", EXE) {
            let in_key = keys
                .iter()
                .any(|o| k == *o || k.starts_with(&format!(r"{o}\")));
            let is_value = values.iter().any(|(vk, vn)| *vk == k && *vn == n);
            assert!(in_key || is_value, "{k} [{n}] would be left behind");
        }
        // And nothing outside NOVA's own keys is deleted whole.
        assert!(
            keys.iter()
                .all(|k| k.contains("NOVA") || k.ends_with("nova-desktop.exe"))
        );
    }

    #[test]
    fn subtitles_are_open_with_only() {
        let p = plan("Software", EXE);
        let defaults: Vec<_> = p
            .iter()
            .filter(|(k, _, _)| k.ends_with("FileAssociations"))
            .collect();
        assert_eq!(defaults.len(), VIDEO.len() + AUDIO.len());
        assert!(
            p.iter()
                .any(|(k, n, _)| k.ends_with(r".srt\OpenWithProgids") && n == "NOVA.Subtitle")
        );
        assert!(!defaults.iter().any(|(_, n, _)| n == ".srt"));
    }

    #[test]
    fn command_quotes_the_exe_and_the_file() {
        let p = plan(
            "Software",
            r"C:\Program Files (x86)\N O V A\nova-desktop.exe",
        );
        let (_, _, cmd) = p
            .iter()
            .find(|(k, _, _)| k.ends_with(r"NOVA.Video\shell\open\command"))
            .unwrap();
        assert_eq!(
            cmd,
            r#""C:\Program Files (x86)\N O V A\nova-desktop.exe" "%1""#
        );
    }

    /// Registered types are a subset of what the app opens (its file dialog list).
    #[test]
    fn registered_types_are_ones_the_player_opens() {
        let types = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../src/services/playback/types.ts"
        ))
        .unwrap();
        let listed = |name: &str| {
            let start = types.find(&format!("export const {name}")).unwrap();
            let body = &types[start..start + types[start..].find("as const").unwrap()];
            body.split('"')
                .skip(1)
                .step_by(2)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        };
        let media = listed("MEDIA_EXTENSIONS");
        let subs = listed("SUBTITLE_EXTENSIONS");
        for e in VIDEO.iter().chain(AUDIO) {
            assert!(
                media.iter().any(|m| m == e),
                ".{e} registered but not in MEDIA_EXTENSIONS"
            );
        }
        for e in SUBTITLE {
            assert!(subs.iter().any(|m| m == e), ".{e}");
        }
        for e in &media {
            let registered = VIDEO.contains(&e.as_str()) || AUDIO.contains(&e.as_str());
            assert!(
                registered || NOT_REGISTERED.contains(&e.as_str()),
                ".{e}: register it or list it in NOT_REGISTERED"
            );
        }
    }

    /// Real registry round trip under a throwaway root, with another app's
    /// association on .mp4 that must survive.
    #[cfg(windows)]
    #[test]
    fn round_trip_leaves_other_apps_alone() {
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};
        let root = format!(r"Software\NOVA-test-{}", std::process::id());
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        let (mp4, _) = hk.create_subkey(format!(r"{root}\Classes\.mp4")).unwrap();
        mp4.set_value("", &"Other.Player").unwrap();
        mp4.create_subkey("OpenWithProgids")
            .unwrap()
            .0
            .set_value("Other.Player", &"")
            .unwrap();

        register(&root, EXE).unwrap();
        register(&root, EXE).unwrap(); // repair is idempotent
        let owp = hk
            .open_subkey(format!(r"{root}\Classes\.mp4\OpenWithProgids"))
            .unwrap();
        assert!(owp.get_raw_value("NOVA.Video").is_ok());
        assert_eq!(mp4.get_value::<String, _>("").unwrap(), "Other.Player");

        unregister(&root, EXE).unwrap();
        assert!(owp.get_raw_value("NOVA.Video").is_err());
        assert!(owp.get_raw_value("Other.Player").is_ok());
        assert_eq!(mp4.get_value::<String, _>("").unwrap(), "Other.Player");
        assert!(
            hk.open_subkey(format!(r"{root}\Classes\NOVA.Video"))
                .is_err()
        );
        assert!(hk.open_subkey(capabilities(&root)).is_err());
        hk.delete_subkey_all(&root).unwrap();
    }
}

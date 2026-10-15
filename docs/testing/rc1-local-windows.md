# RC1 — local Windows build: feature audit and test record

Date: 2026-10-16. Branch `wip/redesign-vlc-controls` merged into `main` as `def7df5` (rollback point: `dcbc903`).

> **Local testing only.** The installer must not be published, attached to a release or offered for download until
> ADR 0003 (libmpv/FFmpeg licensing) and the third-party licence review are resolved. The bundled libmpv build is GPL
> (it includes x264/x265).

## Automated gates (run on the merged code)

| Check | Result |
| --- | --- |
| `cargo test --workspace` | pass — application 19, domain 20, scan 8 (+1 ignored), thumbs 1, playback-api 33, playback-mpv 2, engine 18, storage 28, resume_restart 1; compat harness ignored (needs local samples) |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean |
| `cargo fmt --all -- --check` | clean |
| Vitest | 36/36 |
| `tsc -b --noEmit` | clean |
| `pnpm build` | pass |
| `pnpm tauri build --bundles nsis` | `target\release\bundle\nsis\NOVA_0.1.0_x64-setup.exe`, 36.22 MiB, SHA-256 `B2C067BEC3DEF9CEF6E200796234214351D495D7F4ED6E5F548ED59E4C56C5AE` |

## Installer test (this machine only)

- Silent install (`/S`) exit 0, per-user into `%LOCALAPPDATA%\NOVA` (`nova-desktop.exe`, `libmpv-2.dll`, `uninstall.exe`); uninstall entry "NOVA 0.1.0".
- Installed app launched with a file argument and an isolated data dir: H.264 1080p30 played with d3d11va, 0 drops.
- Screenshot from the installed app: PNG 1920×1080 written to `Pictures\NOVA` (OneDrive-redirected), opened and checked.
- Resume after restart: "resuming at 74600 ms", toast shown. Titles under 60 s do not resume, by design (`ProgressPolicy::min_duration_ms`).
- **Not verified:** a clean machine (Windows Home, no Sandbox/VM), machines without GPU drivers providing `vulkan-1.dll`,
  per-machine install, uninstall, file associations, SmartScreen behaviour of the unsigned installer.

## Feature audit

Status: **Verified** (exercised in the real app), **Partial**, **Missing**, **Deferred**.

### Playback

| Feature | Status | Notes |
| --- | --- | --- |
| Open file(s): dialog, drag-and-drop, launch arguments | Verified | Relative launch paths fixed in this RC (previously ignored silently) |
| Play/pause/seek/volume/mute/speed/fullscreen | Verified | Keys, control bar, context menu |
| Frame step, aspect, rotation, deinterlace, audio/subtitle delay | Verified | Engine state confirmed via the context menu |
| Audio/subtitle track selection, external subtitles | Partial | Menus verified; external subtitle load by drop/dialog verified earlier, not re-run this pass |
| Repeat one/all, shuffle, next/previous, queue reorder | Verified | Alt+↑/↓ and drag reorder |
| Screenshot with location and "Show in folder" | Verified | File opened; reveal accepts only files inside `Pictures\NOVA` (rejection tested). The Explorer window itself was not opened during testing |
| End of media | Verified | New "Finished" card: Play next / Play again / Back to library |
| Failed media | Verified | Error screen names the file, explains, offers Open / Try again / Library |
| Unsupported codec inside a playable file | Verified (harness) | Banner: sound without picture, or picture without sound |

### Library

| Feature | Status | Notes |
| --- | --- | --- |
| Folders, scan progress, cancel, rescan, remove | Partial | UI present; progress/cancel not re-exercised in this pass |
| Search, A–Z/Newest sort, show missing | Partial | Rendered; search typing not re-exercised |
| Thumbnails, durations, spec line | Verified | |
| Continue, resume, Start over | Verified | |
| Clear history | Partial | Verified in an earlier pass |
| Playlists: save, open, rename, delete | Verified | Rename added in this RC (backend existed, no UI) |
| Edit a saved playlist's order | Deferred | Workaround: open it, reorder the queue, save under a new name |
| Duplicate-file detection | Deferred | Library keys on path; duplicates under different paths are listed twice |

### Settings

| Feature | Status | Notes |
| --- | --- | --- |
| Daylight / Night / System; player always dark | Verified | Night persisted across restart |
| Hardware decoding toggle | Partial | Setting present; fallback is automatic in the engine |
| Keymap editor, conflicts, reset | Verified | |
| Mouse wheel/click/double-click | Partial | Settings render; wheel-over-picture not re-exercised |
| Formats page (honest compatibility tiers) | Verified | New in this RC; mirrors `docs/compat/README.md` |
| Shortcuts help (F1/?) | Verified | Ctrl/Alt chords now also work while a text field has focus |

## Known issues

1. Subtitles drawn by mpv can sit under the control bar while controls are visible.
2. Side panels and menus cannot blur the video (it is a native surface below the WebView); they use a 93 %-opaque fill instead.
3. Dev only: a Vite hot reload of `PlayerView` re-opens the launch file.
4. Playlist duration reads "0:30 known" — correct but awkward wording.
5. Contrast was checked by eye on rendered screenshots, not measured with a tool.
6. Licensing (ADR 0003) blocks any distribution; recommended path: option B, an LGPL FFmpeg/mpv build.

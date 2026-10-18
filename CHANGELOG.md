# Changelog

All notable changes to NOVA.

## Unreleased

### Seeking (Windows)
- Arrow keys, the wheel and every ±N s action now land on the requested time. They used keyframe seeks, which
  missed by up to a whole GOP (measured up to 9.9 s on long-GOP files); now within one frame.
- The timeline maps the pointer edge to edge: the time in the hover preview is the time you land on (it could differ
  by up to a minute on long files). Dragging sends one seek at a time, newest first; release lands exactly and the
  playhead no longer jumps back while it does.
- New setting "While dragging the timeline": Adaptive (exact frames while the decoder keeps up), Exact frames, or
  Keyframes.
- Hover previews are decoded for the time you hover; a nearby stand-in is dimmed and labelled with its own time.
- PageUp / PageDown on the focused timeline move by a tenth of the file; End goes to the end.
- Seek measurements and specification: `docs/architecture/seeking.md`.

## Mobile 0.1.0 (2026-10-18), first release for Android and iPhone

Android: a signed APK on GitHub (pre-release). iPhone: runs through Expo Go (SDK 57); there is no App Store build yet.
NOVA plays through the phone's own decoders (AVPlayer, Media3). The NOVA engine (libmpv) comes later (ADR 0007).

- The desktop's structure on a phone:
  - Home: Continue, Your shelf, Recently added and Playlists.
  - Library: folders, search, A–Z / Newest / Recent, Missing files, grid or list, poster frames and an item menu.
  - Player: the deck with readouts, and a menu grouped like the desktop context menu.
- Seeking: exact landing, latest-wins scrubbing, preview frames, ½–⅛ fine scrubbing, double-tap skip that adds up
  with repeated taps, and go to time.
- Playback:
  - queue with repeat and shuffle; playlists
  - A–B loop, frame step, speed 0.25–2×, audio and subtitle tracks
  - aspect, rotation, lock, picture in picture
  - volume and brightness swipes
  - resume with Start over
- Add files or whole folders without storage permissions (system picker; SAF on Android). Nothing leaves the phone.
- Light and dark themes; haptics; screen-reader labels; 48 pt touch targets.
- Architecture decision: `docs/adr/0007-mobile-architecture.md`. Release process: `docs/release/mobile.md`.

## 0.2.0 (2026-10-17) — the redesigned player

Windows x64 NSIS installer. Licensing is unchanged from 0.1.0. 0.1.0 has no updater, so install 0.2.0 once by hand;
later releases arrive in the app.

### Player
- A new control bar in two sizes, switched with its own button, the C key, the View menu or Settings: **Full** (the
  timeline across the player) and **Compact** (one small bar centred at the bottom with a short timeline, as in VLC).
- Translucent header and controls so the picture shows through; labels keep their contrast over bright footage.
- Right-click (or the Menu key / Shift+F10) opens a compact menu at the pointer: Play/Pause, Playback, Audio,
  Subtitles, Video, View, Playlist and Tools, each a submenu with current values beside them. Unavailable items say why.
  Clicking a control's button a second time closes its menu.
- Timeline: frame previews when you hover (decoded by the engine), chapter marks and names when the file has chapters,
  the A–B loop drawn as a bracket, click the length to show time remaining.
- Subtitle size: Ctrl + mouse wheel over the picture, Alt+↑ / Alt+↓ / Alt+0, the Subtitles menu or Settings; remembered
  between sessions. Ctrl + wheel can be set to volume or nothing.
- Chapters: Shift+N / Shift+P (the VLC keys; next/previous title stays on N / P).
- On-screen readouts for volume, subtitle size, delays, speed, aspect, rotation and A–B, from the engine's own values.
- Readout keys for speed, audio, subtitles and A–B show their current state; the header shows a tally lamp, the
  state, and the decoder.
- The queue is drawn as a line of stations; the title that is loaded is marked "On air" in Home and the Library.

### Updates and installer
- In-app updates: NOVA checks GitHub for a newer **signed** release shortly after start-up (Settings → About can turn
  this off, or check by hand) and installs it on request, then restarts.
- The installer carries NOVA's identity: Lumen N artwork, publisher and description.

### Engine contract
- `SetSubtitleScale`, `adjust.subtitleScalePercent`, `chapters` in the snapshot; `preview_frame` command for timeline
  frames (one isolated, software-decoded frame of the playing file at a time). New preferences: `subScale`,
  `ctrlWheel`, `timelineLayout`, `updates`.

## 0.1.0 (2026-10-16) — first public release

Windows x64 NSIS installer, built from tag `v0.1.0`. Tested on one Windows 11 machine.

- NOVA's code is licensed MIT OR Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`).
- The installer bundles the shinchiro mpv/FFmpeg build `20261015`, which contains GPL components, so the installer as
  a whole is distributed under the GPL. Licence texts, `THIRD-PARTY-NOTICES.md` and the engine's source information
  ship in the install folder's `licenses/` and on the GitHub release (ADR 0003).
- Settings → About states the licensing.
- Everything in 0.1.0-rc.1 below.

## 0.1.0-rc.1 (2026-10-16) — local release candidate, not distributed

Windows x64 NSIS installer built from `main`; tested on this machine only (see `docs/testing/rc1-local-windows.md`). Not published: ADR 0003 licensing review is open.

### Interface
- Player deck: one transport with the Lumen-beam playhead, quiet controls, a "More" menu for every picture, sound, subtitle and frame tool; subtitles rise above the controls and the picture re-centres beside open panels.
- Home: lead title with progress and Resume, artwork grids, "Your shelf", playlists, a first-launch view.
- Library: grid and list views, item menu (Play, Add to queue), a "Missing files" filter.
- Settings: key search, "Saved" confirmation, a Formats page with honest support tiers.
- End-of-media card, screenshot "Show in folder", playlist rename, Go to time focus fix, relative launch paths.


### Media compatibility
- Content-first file detection: real media plays despite misleading extensions; editing projects (Premiere, After Effects, Resolve, Final Cut, …) are explained instead of failing; camera RAW formats get vendor-decoder guidance.
- Missing-decoder detection: if one stream can't be decoded, the rest keeps playing and a banner explains why.
- Playback inspector: container, codec/profile, resolution/fps, bit depth, chroma, alpha, color, HDR, hardware/software decoder, audio details.
- Compatibility harness and 55-sample synthetic corpus (ProRes, DNxHR/HD, CineForm, XAVC-I/AVC-Intra/XDCAM-style MXF, HDR10/HLG, 4K/8K, alpha, pro audio, failure cases). 55/55 pass in software and hardware-decoding runs. See docs/compat.

### M2: Persistence and media library
- Local SQLite library (schema v2). Playback resumes where you left off, across restarts and crashes, and moved or renamed files keep their progress.
- Library folders with background scanning that can be cancelled, live progress, missing-file handling and detection of interrupted scans.
- Indexed library search (FTS5), with sorting and a "show missing" option.
- Home screen with Continue Watching and Recently added.

### M1: Playback core
- Play queue with next/previous, automatic advance when the engine confirms the end of a file, and reorder/remove/append. Multiple files can be opened or dropped at once.
- A–B loop. Pressing play at the end of a file restarts it.

### M0: Rendering feasibility
- Tauri 2 + React shell with libmpv rendering under a transparent WebView2.
- The UI shows only engine-confirmed playback state. Tracks, speed, volume, fullscreen, keyboard shortcuts and actionable error screens.

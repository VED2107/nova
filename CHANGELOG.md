# Changelog

All notable changes to NOVA.

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

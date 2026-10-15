# Changelog

All notable changes to NOVA. No public release has been made: licensing is still unresolved (ADR 0003).

## Unreleased

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

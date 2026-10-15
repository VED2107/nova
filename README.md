# NOVA

A privacy-first, open-source desktop media player from **SNOWBROS**.
No account, no telemetry, works offline.

> Status: **M0 — architecture and rendering feasibility.** Windows only.
> Not ready for end users. See [docs/testing/m0-results.md](docs/testing/m0-results.md).

## What works today (verified on Windows 11)

- Open a local file via the file picker (`O` / `Ctrl+O`), drag-and-drop, or as a command-line argument
- Native video (libmpv, D3D11, hardware decoding with software fallback) under a transparent React UI
- Play/pause, seek bar (scrub + exact seek on release), ±5 s / ±30 s keys, volume/mute, speed, audio and subtitle track selection, fullscreen
- Engine-confirmed state only: the UI shows what libmpv reports, never what it hopes happened
- Actionable error screens for missing, damaged and non-media files
- Playback info popover (codec, resolution, hardware/software decoder, output)

## Architecture

```text
apps/desktop/            Tauri 2 shell + React 19 / TypeScript / Tailwind 4 UI
  src/services/playback  typed commands, snapshot store, shortcuts
  src/features/player    player surface and controls
  src-tauri/             typed Tauri commands, engine bootstrap, native surface z-order
crates/
  nova-playback-api/     backend-neutral contract + pure state reducer (no engine deps)
  nova-playback-mpv/     libmpv backend (runtime-loaded) + real-engine integration tests
docs/adr/                architecture decisions (engine, rendering, licensing)
scripts/                 pinned libmpv fetch, synthetic fixture generation
```

Decisions: [ADR 0001 engine](docs/adr/0001-playback-engine-libmpv.md) ·
[ADR 0002 rendering](docs/adr/0002-video-rendering-in-tauri.md) ·
[ADR 0003 licensing](docs/adr/0003-libmpv-distribution-and-licensing.md)

## Develop (Windows)

```bash
bash scripts/fetch-libmpv.sh       # pinned + hash-checked engine → vendor/
bash scripts/generate-fixtures.sh  # synthetic test media (needs ffmpeg)
pnpm install
pnpm dev                           # Vite + Tauri dev build
```

Tests: see [docs/testing/README.md](docs/testing/README.md).

| Env var | Effect |
| --- | --- |
| `NOVA_LIBMPV_PATH` | Use a specific `libmpv-2.dll` |
| `NOVA_HWDEC` | libmpv `hwdec` value (default `auto-safe`; `no` forces software) |
| `NOVA_STATS=1` | Log engine-measured A/V sync, drops, decoder and output every 2 s |

## Keyboard

| Key | Action |
| --- | --- |
| Space / K | Play / pause (at the end: replay) |
| ← / → | Seek 5 s (Shift: 30 s) |
| ↑ / ↓ | Volume ±5 % |
| M | Mute |
| F / double-click | Fullscreen; Esc exits |
| O / Ctrl+O | Open file |
| Home | Back to start |

## Known limitations

- **Licensing unresolved:** the development libmpv build is GPL (contains x264/x265).
  Do not distribute installers until [ADR 0003](docs/adr/0003-libmpv-distribution-and-licensing.md) is decided.
- Windows only; macOS/Linux rendering not started.
- Not yet tested: clean-machine install, multi-monitor/mixed DPI, display disconnect in fullscreen, Windows 10, AMD GPUs, HDR, long soak (2 h), Bluetooth audio latency.
- The dev libmpv build imports `vulkan-1.dll` (from GPU drivers); clean-machine behavior unverified.
- Depends on libmpv's child window class name `mpv` for z-ordering (ADR 0002).
- FFmpeg writes some demuxer warnings directly to stderr despite `terminal=no`.
- No library, playlists/queue, resume, persistence or settings yet (M1–M2).
- TypeScript contract types are hand-mirrored from Rust; generate them or add a contract test (follow-up).
- App icon is a placeholder.
- CI workflow is written but has not run yet.

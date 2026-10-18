# NOVA

A privacy-first, open-source desktop media player from **SNOWBROS**.
No account, no telemetry, works offline.

> Status: **M0 to M2 complete (Windows).** See [CHANGELOG](CHANGELOG.md).
> Not ready for end users. See [docs/testing/m0-results.md](docs/testing/m0-results.md).

## What works today (verified on Windows 11)

- Open one or more local files via the file picker (`O` / `Ctrl+O`), drag-and-drop, or command-line arguments
- Play queue: next/previous, auto-advance when the engine confirms end of media, reorder, remove, append (drop onto the open queue)
- A–B loop (`L`: set A → set B → clear), shown on the seek bar
- Media library: add folders, background scanning (cancellable), search, Home with Continue Watching
- Professional formats verified on synthetic samples (ProRes, DNxHR/HD, CineForm, XAVC-I/AVC-Intra/XDCAM-style MXF, HDR10/HLG, 4K/8K, pro audio). Camera RAW and editing projects are detected and explained. See [docs/compat](docs/compat/README.md)
- Resume where you left off, across restarts and crashes (local SQLite; moved/renamed files keep their progress), with a "Start over" option
- Native video (libmpv, D3D11, hardware decoding with software fallback) under a transparent React UI
- Play/pause, frame-accurate seeking (timeline drag with exact landing, ±1/5/30/60 s keys within one frame; [measurements](docs/architecture/seeking.md)), volume/mute, speed, audio and subtitle track selection, fullscreen
- Engine-confirmed state only: the UI shows what libmpv reports, never what it hopes happened
- Actionable error screens for missing, damaged and non-media files
- Playback info popover (codec, resolution, hardware/software decoder, output)

## Architecture

```text
apps/desktop/            Tauri 2 shell + React 19 / TypeScript / Tailwind 4 UI
apps/mobile/             Expo / React Native preview for iOS and Android (Expo Go; see its README)
  src/services/playback  typed commands, snapshot store, shortcuts
  src/features/player    player surface and controls
  src-tauri/             typed Tauri commands, engine bootstrap, native surface z-order
crates/
  nova-domain/           pure domain rules (play queue, resume policy)
  nova-application/      use cases (queue, progress tracking) over ports
  nova-storage/          SQLite: migrations, media identity, progress, library + FTS search
  nova-library/          background folder scanner (worker thread, cancellable)
  nova-playback-api/     backend-neutral contract + pure state reducer (no engine deps)
  nova-playback-mpv/     libmpv backend (runtime-loaded) + real-engine integration tests
docs/adr/                architecture decisions (engine, rendering, licensing)
scripts/                 pinned libmpv fetch, synthetic fixture generation
```

Decisions: [ADR 0001 engine](docs/adr/0001-playback-engine-libmpv.md) ·
[ADR 0002 rendering](docs/adr/0002-video-rendering-in-tauri.md) ·
[ADR 0003 licensing](docs/adr/0003-libmpv-distribution-and-licensing.md) ·
[ADR 0004 persistence](docs/adr/0004-local-persistence-and-resume.md) ·
[ADR 0005 library](docs/adr/0005-media-library-scanning-and-search.md) ·
[ADR 0006 compatibility](docs/adr/0006-media-compatibility-policy.md) ·
[ADR 0007 mobile](docs/adr/0007-mobile-architecture.md)

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
| L | A–B loop: set A, set B, clear |
| Shift+N / Shift+P | Next / previous in queue (previous restarts if > 3 s in) |
| Q | Show / hide queue |
| / | Focus library search |

## Known limitations

- **Licensing:** NOVA's code is MIT OR Apache-2.0. The 0.1.0 installer bundles a third-party libmpv build with GPL
  parts (x264/x265), so the installer is distributed under the GPL with its source and notices
  ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), [ADR 0003](docs/adr/0003-libmpv-distribution-and-licensing.md)).
  Later releases move to an LGPL engine built from source.
- Windows is the only released platform. iOS/Android exist as an Expo Go preview (`apps/mobile`), not a release.
- Not yet tested: clean-machine install, multi-monitor/mixed DPI, display disconnect in fullscreen, Windows 10, AMD GPUs, HDR, long soak (2 h), Bluetooth audio latency.
- The dev libmpv build imports `vulkan-1.dll` (from GPU drivers); clean-machine behavior unverified.
- Depends on libmpv's child window class name `mpv` for z-ordering (ADR 0002).
- FFmpeg writes some demuxer warnings directly to stderr despite `terminal=no`.
- No metadata extraction (duration/codec/artwork) during scans, saved playlists or settings yet.
- Library does not watch folders; rescan manually after changes.
- Media opened outside the queue (none today in the UI) is not progress-tracked.
- Queue does not auto-skip files that fail to load; playback stops on the error screen.
- Queue panel, A–B controls, Home and Library screens are type-checked and covered by logic/component tests but have not been visually verified (no GUI automation while the machine was in use).
- TypeScript contract types are hand-mirrored from Rust; generate them or add a contract test (follow-up).
- App icon is a placeholder.
- CI workflow is written but has not run yet.

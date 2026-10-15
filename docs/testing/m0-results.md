# M0 results — rendering feasibility and first vertical slice

Date: 2026-10-15. Every number below was observed in command output or
screenshots during the session; nothing is extrapolated.

## Environment

| | |
| --- | --- |
| OS | Windows 11 Home, build 10.0.26200 |
| CPU / RAM | Intel Core i5-10300H / 15.8 GB |
| GPUs | Intel UHD Graphics (31.0.101.1999) + NVIDIA GeForce GTX 1650 (32.0.16.1742) — hybrid laptop |
| Display | 1920×1080, engine-reported `display-fps` 240 |
| WebView2 | 155.0.4283.45 |
| Toolchain | rustc 1.96.1 (MSVC), Node 24.13, pnpm 11.1.1, VS Build Tools 2022 17.14 |
| Engine | mpv v0.41.0-1175-g492bae076, FFmpeg N-127552-gee8cbd7db, client API 2.5 |

## Automated tests

| Suite | Result |
| --- | --- |
| `nova-playback-api` | 24 / 24 passed |
| `nova-playback-mpv` unit | 2 / 2 passed |
| `nova-playback-mpv` real-engine integration | 15 / 15 passed; earlier 14-test version passed 5 consecutive runs |
| Frontend (Vitest) | 9 / 9 passed |
| `tsc` strict | clean |

Engine lifecycle (15 create → play → destroy cycles after warm-up):
OS handles 103 → 103; private bytes 5.0 → 10.3 MiB (within the 64 MiB
test bound; needs a longer soak to rule out slow growth).

Truncated file: engine reports `Playing`, duration 30 s, no hang.

## Rendering gate (handoff §5.6)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Real video renders in the intended window | **Pass** | Screenshot: 1080p H.264 frame in the Tauri window, translucent HTML overlay alpha-blended over it; UI position 5.2 s vs burned-in `00:00:05.233` |
| 2 | A/V stay synchronized | **Pass (engine-measured)** | `avsync` sampled every 2 s: worst −2.6 ms (first sample after start, VP9 release run), steady state 5–17 µs (hw) and 10–47 µs (sw), H.264 and HEVC. Not yet measured: long-duration drift, Bluetooth/HDMI audio latency |
| 3 | Seeking and resizing behave correctly | **Pass** | Seeks: integration tests (exact seek within 50 ms, rapid seeks settle on last target). Resize to 806×513: video and controls re-laid out (screenshot) |
| 4 | Fullscreen enter/exit | **Pass (single monitor)** | Screenshots: 1920×1080 fullscreen with controls; exit restores 806×513 |
| 5 | UI responsive while decoding | **Pass (observed)** | Controls, menus and position updates live during playback; 0 decoder/VO drops. No input-latency measurement yet |
| 6 | Shutdown/reopen without leaks | **Pass** | All 5 app runs closed via WM_CLOSE logged `engine shut down`; timed closes: 232, 257, 232 ms; lifecycle leak test above |
| 7 | Packaged run on a clean Windows machine | **Not verified** | Installer build: see below. No clean VM available (Windows Home: no Sandbox) |
| 8 | License obligations understood | **Documented, decision pending** | ADR 0003: current DLL is GPL; LGPL self-build recommended |

Decoding:

| File | `hwdec` | Drops (decoder/VO) | avsync |
| --- | --- | --- | --- |
| H.264 1080p30 | `d3d11va` | 0 / 0 | −498 µs at 1 s, then 5–6 µs |
| multitrack H.264 720p30 | `d3d11va` | 0 / 0 | 7–17 µs |
| HEVC 1080p24 | `d3d11va` | 0 / 0 | 5–7 µs |
| HEVC 1080p24, `NOVA_HWDEC=no` | software | 0 / 0 | 10–47 µs |

Video output: `vo=gpu-next`, `gpu-context=d3d11`.

## Incident during testing

During one GUI-automation run, Windows refused to bring NOVA to the
foreground and three synthetic key presses (Right, Right, Space) were sent
to another application the user had open. The driver now aborts unless
NOVA is the foreground window; the affected screenshots were deleted.

## Packaging

- `pnpm tauri build` → `target/release/bundle/nsis/NOVA_0.1.0_x64-setup.exe`
  (35.08 MiB, libmpv bundled as a resource). Built, **not installed or
  tested on a clean machine**, and **must not be distributed** (ADR 0003).
- Release exe run from `target/release` (embedded frontend, DLL beside exe):
  VP9 played (`d3d11`, 0 drops, avsync −2.6 ms first sample then 3 µs),
  z-order correct, clean shutdown.
- `dumpbin /dependents libmpv-2.dll`: only Windows system DLLs, UCRT
  (`api-ms-win-crt-*`) and **`vulkan-1.dll`**. The Vulkan loader ships with
  GPU drivers, not with Windows itself; on a machine without it libmpv fails
  to load and NOVA shows "Playback engine missing". Must be verified on a
  clean VM; an LGPL self-build (ADR 0003) can drop Vulkan or the installer
  can check for it.

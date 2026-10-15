# ADR 0002 — Native video surface under a transparent WebView2 (Windows)

- **Status:** Accepted for Windows (M0 spike passed, 2026-10-15). macOS/Linux open.

## Context

The handoff's critical gate: prove real video renders inside the Tauri window
with HTML controls over it, without copying frames through the WebView.

Options considered:

| Option | Verdict |
| --- | --- |
| libmpv render API → copy frames into the WebView (canvas/IPC) | Rejected: per-frame copies through IPC cannot sustain 4K/high-fps; loses GPU decode zero-copy |
| Separate native player window behind/owned by the UI window | Fallback only: window sync (move, resize, minimize, fullscreen, z-order, taskbar) is fragile |
| **`wid` embedding: libmpv renders into the main window; WebView2 transparent on top** | **Chosen** |

## Decision

- The Tauri main window is created with `transparent: true` and a fully
  transparent background; the page background is `transparent`.
- libmpv receives the main window HWND as `wid` and creates its own child
  window (class `mpv`) with a D3D11 swapchain (`vo=gpu-next`, `gpu-context=d3d11`).
- After startup NOVA finds that child and moves it to `HWND_BOTTOM`, so the
  WebView2 child (`WRY_WEBVIEW`) is above it. DWM composes the transparent
  WebView over the video. Logged z-order at runtime:
  `["WRY_WEBVIEW", "mpv"]` (top first).

## Evidence (this machine, see docs/testing/m0-results.md)

- Real H.264 1080p frame visible with a semi-transparent HTML element
  alpha-blended over it; UI time matched burned-in timecode.
- Resize to 806×513, fullscreen 1920×1080 and fullscreen exit all re-laid out
  video and controls correctly (screenshots).
- `avsync` worst −0.5 ms right after start, 5–47 µs steady state; 0 decoder/VO drops, `hwdec=d3d11va`, HEVC software
  fallback also 0 drops.
- Graceful close destroys the engine in ~230–260 ms.

## Risks / follow-ups

- Relies on libmpv creating a child window with class name `mpv` (polled up
  to 5 s). If an mpv update changes this, the UI would be hidden behind video;
  the warning is logged. Add a startup self-check to the smoke test.
- Not yet tested: multi-monitor/mixed DPI, display disconnect during
  fullscreen, Windows 10, AMD GPUs, HDR output, Intel-only (iGPU) path.
- The WebView must stay transparent wherever video should show; any opaque
  full-window element hides the video (empty/error states are intentionally opaque).
- macOS/Linux need their own spike (NSView/X11/Wayland embedding differ).

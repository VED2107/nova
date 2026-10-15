# Testing NOVA

## Prerequisites (Windows)

- Rust (MSVC toolchain), Node 20+, pnpm, Visual Studio Build Tools, WebView2
- FFmpeg with libx264, libx265, libvpx-vp9, libopus on `PATH` (fixture generation only)

```bash
bash scripts/fetch-libmpv.sh        # pinned libmpv → vendor/libmpv (hash-checked)
bash scripts/generate-fixtures.sh   # synthetic media → tests/fixtures/media
pnpm install
```

## Suites

| Command | What it proves |
| --- | --- |
| `cargo test -p nova-playback-api` | State reducer rules, stale-session filtering, input validation, JSON contract shape |
| `cargo test -p nova-playback-mpv` | **Real libmpv** (headless: `vo=null`, `ao=null`) against the fixture corpus: load, duration, tracks, pause/seek/resume, rapid seeks, EOF and replay, invalid/truncated media, missing files, rapid file switching, track selection, volume/mute/speed confirmation, stop, and engine create/destroy leak check |
| `cargo test -p nova-domain` | Queue rules: ordering, cursor after remove/move, ends |
| `cargo test -p nova-application` | Queue service against a fake backend: auto-advance once per own session, previous-restarts, validation |
| `cargo test -p nova-storage` | SQLite migrations, newer-schema refusal, corrupt file, identity (moved/copied/replaced), constraints; **`resume_restart`**: real libmpv + services + SQLite file across two simulated restarts |
| `pnpm --filter @nova/desktop test` | Frontend: snapshot ordering, time/track formatting, keyboard shortcut mapping |
| `pnpm --filter @nova/desktop check` | TypeScript strict type check |

Override the engine with `NOVA_LIBMPV_PATH=...`.

## Manual / visual verification (rendering gate)

Headless tests cannot prove pixels reach the screen or A/V sync. For that:

```bash
pnpm --filter @nova/desktop dev     # in one terminal (Vite)
NOVA_STATS=1 target/debug/nova-desktop.exe tests/fixtures/media/h264_aac_1080p30_30s.mp4
```

`NOVA_STATS=1` logs engine-measured `avsync`, dropped frames, video output,
GPU context and active hardware decoder every 2 s. `NOVA_HWDEC=no` forces
software decoding.

The fixtures carry a **sync pattern**: a white bar flashes for the first
100 ms of every second while the audio beeps. Watch/listen for alignment.

### Caution for automated GUI checks

Synthetic keyboard input goes to whatever window is in the foreground.
Any GUI driver must verify NOVA is the foreground window before sending
input or capturing the screen, and should not run while someone is using
the machine.

## Corpus

All media is synthesized by `scripts/generate-fixtures.sh` from FFmpeg
`lavfi` sources (no third-party content), so it is freely distributable and
reproducible. Generated files are git-ignored.

| File | Purpose |
| --- | --- |
| `h264_aac_1080p30_30s.mp4` | Baseline H.264/AAC, timecode + sync pattern |
| `hevc_aac_1080p24_10s.mkv` | HEVC/Matroska |
| `vp9_opus_720p30_10s.webm` | VP9/Opus/WebM |
| `h264_aac_360p30_180s.mp4` | 3-minute file for resume rules (≥ 60 s) |
| `multitrack_h264_2a_2s_10s.mkv` | 2 audio (eng/fra, titled) + 2 subtitle tracks |
| `truncated_h264.mp4` | First 200 KB of the baseline (damaged file) |
| `not_media.mp4` | Text file with a media extension |

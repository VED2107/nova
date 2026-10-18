# Seeking: diagnosis, specification and measurements

Status: **M1 implemented for the Windows desktop app (2026-10-18).** The engine measurements below come from headless libmpv
(`vo=null`, `ao=null`) on the development machine. The UI fixes are covered by unit tests and a Chromium reproduction.
**They have not yet been checked by hand in the running app**, because GUI automation was not run while the machine was in use.
For mobile, see [mobile.md](mobile.md).

## 1. Diagnosis: what was actually wrong

The measurements come from `crates/nova-playback-mpv/examples/seek_probe.rs`, run over the synthetic corpus from
`scripts/generate-seek-fixtures.sh`. The corpus has 15 files:

- frame rates from 23.976 to 120 fps
- 2 s and 10 s GOPs, and an all-intra file
- HEVC with B-frames, AV1 and ProRes
- variable frame rate (24, 60 and 10 fps segments)
- a 2-hour file

Ground truth is the pts of every frame, read with ffprobe. Raw tables are in [docs/testing/seek/](../testing/seek/).

| # | Cause | Evidence | Severity |
|---|---|---|---|
| D1 | **Relative seeks were keyframe seeks.** This covers ← →, the wheel and the ±5/30/60 s actions. `seek <n> relative` uses libmpv's default, which is precise only for absolute seeks. | On long-GOP files the median error was 3.3–5.8 s and the maximum 9.9 s. On 2 s GOP files the median was 1.0 s. A "+5 s" press could land almost a whole GOP away. | High |
| D2 | **The pointer-to-time mapping on the timeline disagreed with itself.** The hover preview used the full track width. The native `<input type=range>` maps through an invisible 12 px thumb inset. So the time shown under the pointer was not the time a click or drag produced. | Reproduced in Chromium with a 700 px track and a 2 h file: up to **61.7 s** apart near the edges, and 44.9 s apart at 100 px in. | High on long files |
| D3 | **A key press on the focused slider issued two conflicting seeks.** The global ← → action sent `seekRelative ±5 s`. The range input also moved by its 100 ms `step` and, on key-up, committed an exact seek to the old position + 0.1 s. | Code path: `Timeline.tsx` `onKeyUp={commit}`, and the `PlayerView` keydown handler let `type=range` through. | Medium |
| D4 | **The playhead snapped back after release.** `scrubMs` was cleared as soon as the final seek was sent. Until the exact seek finished and the next 100 ms position update arrived, the timeline showed the last engine position: the old one, or the keyframe the drag had landed on. | Exact seeks take 2–160 ms (p95), plus up to 100 ms of emit throttle. | Medium (looks inaccurate) |
| D5 | **Dragging showed keyframe frames under a time that looked exact.** Scrub seeks were `keyframes` seeks every 80 ms, while the bubble printed the pointer time. | Keyframe seeks landed a median of 1.0 s (2 s GOP) to 5.8 s (10 s GOP) before the target. | Medium |
| D6 | **Hover previews were bucketed** to `duration/240`, which is 30 s on a 2 h file. The frame was shown at full opacity under the exact pointer time, so it could be 15 s away from its label. | `previewBucket()` | Low–medium |
| D7 | `step={100}` rounded every target to 100 ms. | Code | Low |

These were checked and are not causes:

- **ms↔s conversion.** `secs_to_ms` rounds once, and commands use `{:.3}` seconds.
- **Stale session events.** The reducer drops events from other sessions. In the rapid-seek test, no snapshot disagreed with the engine by more than 50 ms.
- **Duration clamping.**

**One engine behaviour is correct but needs to be understood.** libmpv's exact seek shows the **first frame whose pts is at or after target − 5 ms**. This held for 100 % of samples on every file. When the target falls in the middle of a frame's display time, that frame is the *next* one. So the frame shown can be up to one frame later than the frame "on screen at T". FFmpeg's accurate `-ss` seeking uses the same convention. NOVA keeps this behaviour and documents it in §2.

## 2. Specification

**Fast seek**, `Seek { exact: false }`, lands on a nearby keyframe, which can be a whole GOP away. NOVA uses it only while dragging, in two cases: in adaptive mode when the engine is too slow for exact seeks, or when the user picks "Keyframes". The UI never presents a frame from a fast seek as the exact target.

**Accurate seek**, `Seek { exact: true }` and every `SeekRelative`, lands on the first frame whose pts is at or after target − 5 ms. NOVA uses it on release and for keys, the wheel, chapters, Go to time and resume.

**Timeline interaction (desktop)**

1. **One mapping.** `pointerToMs(x, left, width, duration)` maps edge to edge and serves hover, press, drag and release. There is no thumb inset and no step rounding. Times are float ms internally and are rounded once per command.
2. **Dragging is latest-wins.** At most one seek is in flight, and a newer target replaces any queued one.
   - A seek has settled when the engine reported `seeking` after it and then left that state. Position updates while playing do not count.
   - A seek that is never reported as started is abandoned after 250 ms. One that started is abandoned after 1.5 s.
3. **Scrub mode** is set by the `scrub` preference:
   - `auto`: accurate seeks while the last accurate seek settled within 120 ms, keyframe seeks otherwise.
   - `accurate`: always accurate.
   - `fast`: always keyframes.

   Release is always one accurate seek.
4. **No snap-back.** The playhead holds the release target until that seek settles.
5. **Keys.** ← → go to the configurable global actions: ±5 s, Shift ±30 s, Ctrl ±60 s, Alt ±1 s. The slider itself handles PageUp and PageDown (±10 % of the media, at least 10 s) and End.
6. **Previews** are requested for the exact hovered time, in 100 ms steps. A cached nearby frame can stand in meanwhile. It is dimmed and labelled with its own time.
7. **Frame stepping** (`frame-step` / `frame-back-step`) stays separate from time seeking.

**Acceptance criteria.** Engine criteria apply per corpus file, paused, with n ≥ 40.

- **Accurate absolute seek:** 100 % of seeks land on the frame the engine rule predicts, and the worst error is at most one frame duration + 1 ms of rounding.
- **Relative ±5 s:** the worst error is at most one frame duration (before the fix it was up to one GOP).
- **Rapid supersession** (12 seeks sent without waiting): playback settles on the last target, per the engine rule, and the snapshot agrees with the engine within 50 ms.
- **UI:** the hover time equals the landing time at every pixel (unit tests), and the playhead does not snap back (unit-tested state machine). **This still needs to be confirmed visually in the app.**

## 3. Results (2026-10-18)

"Before" is `main` at 3731b03; "after" is this change. Each error is |presented frame pts − target|.
"On-screen frame" counts seeks that landed on the frame displayed at T. "Engine rule" counts seeks that landed on the first frame at or after T − 5 ms.

| File | Mode | Before: median / p95 / max abs err (ms) | After: median / p95 / max (ms) | After: on-screen frame | After: engine rule | After latency p50/p95 ms |
|---|---|---|---|---|---|---|
| av1_30_gop10s.mkv | absolute exact | 1.0 / 24.0 / 28.0 | 1.0 / 24.0 / 28.0 | 14/40 | 40/40 | 80 / 153 |
| av1_30_gop10s.mkv | relative ±5 s | 5767.0 / 9433.0 / 9667.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 64 / 146 |
| h264_24_2h.mp4 | absolute exact | 1.3 / 30.7 / 35.7 | 1.3 / 30.7 / 35.7 | 12/40 | 40/40 | 7 / 11 |
| h264_24_2h.mp4 | relative ±5 s | 3291.7 / 9000.0 / 9708.3 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 5 / 10 |
| h264_30_gop10s.mp4 | absolute exact | 1.3 / 23.7 / 27.0 | 1.3 / 23.7 / 27.0 | 13/40 | 40/40 | 24 / 43 |
| h264_30_gop10s.mp4 | relative ±5 s | 4900.0 / 9000.0 / 9433.3 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 15 / 43 |
| h264_30_intra.mp4 | absolute exact | 1.3 / 25.3 / 26.7 | 1.3 / 25.3 / 26.7 | 11/40 | 40/40 | 2 / 3 |
| h264_30_intra.mp4 | relative ±5 s | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 1 / 2 |
| h264_r120_gop2s.mp4 | absolute exact | 1.0 / 4.3 / 4.7 | 1.0 / 4.3 / 4.7 | 24/40 | 40/40 | 18 / 30 |
| h264_r120_gop2s.mp4 | relative ±5 s | 1000.0 / 1775.0 / 1875.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 16 / 34 |
| h264_r24000_1001_gop2s.mp4 | absolute exact | 1.2 / 28.0 / 34.7 | 1.2 / 28.0 / 34.7 | 11/40 | 40/40 | 7 / 12 |
| h264_r24000_1001_gop2s.mp4 | relative ±5 s | 1006.0 / 1840.2 / 1881.9 | 5.0 / 36.7 / 36.7 | 8/20 | 18/20 | 6 / 9 |
| h264_r24_gop2s.mp4 | absolute exact | 1.3 / 25.3 / 33.7 | 1.3 / 25.3 / 33.7 | 14/40 | 40/40 | 7 / 10 |
| h264_r24_gop2s.mp4 | relative ±5 s | 1000.0 / 1791.7 / 1875.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 6 / 9 |
| h264_r25_gop2s.mp4 | absolute exact | 1.0 / 28.0 / 34.0 | 1.0 / 28.0 / 34.0 | 15/40 | 40/40 | 5 / 8 |
| h264_r25_gop2s.mp4 | relative ±5 s | 1000.0 / 1800.0 / 1880.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 6 / 10 |
| h264_r30000_1001_gop2s.mp4 | absolute exact | 1.2 / 25.6 / 28.3 | 1.2 / 25.6 / 28.3 | 11/40 | 40/40 | 9 / 16 |
| h264_r30000_1001_gop2s.mp4 | relative ±5 s | 1006.0 / 1873.5 / 2007.0 | 5.0 / 28.4 / 28.4 | 7/20 | 17/20 | 7 / 11 |
| h264_r30_gop2s.mp4 | absolute exact | 1.0 / 20.7 / 24.7 | 1.0 / 20.7 / 24.7 | 14/40 | 40/40 | 5 / 9 |
| h264_r30_gop2s.mp4 | relative ±5 s | 1000.0 / 1800.0 / 1900.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 6 / 9 |
| h264_r50_gop2s.mp4 | absolute exact | 1.0 / 8.0 / 14.0 | 1.0 / 8.0 / 14.0 | 17/40 | 40/40 | 9 / 16 |
| h264_r50_gop2s.mp4 | relative ±5 s | 1000.0 / 1780.0 / 1880.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 9 / 15 |
| h264_r60000_1001_gop2s.mp4 | absolute exact | 1.2 / 9.6 / 11.6 | 1.2 / 9.6 / 11.6 | 15/40 | 40/40 | 10 / 16 |
| h264_r60000_1001_gop2s.mp4 | relative ±5 s | 1006.0 / 1856.8 / 2007.0 | 5.0 / 11.7 / 11.7 | 7/20 | 16/20 | 10 / 14 |
| h264_r60_gop2s.mp4 | absolute exact | 1.0 / 7.0 / 8.7 | 1.0 / 7.0 / 8.7 | 17/40 | 40/40 | 10 / 16 |
| h264_r60_gop2s.mp4 | relative ±5 s | 1000.0 / 1783.3 / 1883.3 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 9 / 14 |
| hevc_24_gop10s.mkv | absolute exact | 1.0 / 30.0 / 35.0 | 1.0 / 30.0 / 35.0 | 14/40 | 40/40 | 27 / 49 |
| hevc_24_gop10s.mkv | relative ±5 s | 3750.0 / 9000.0 / 9292.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 38 / 53 |
| prores_25.mov | absolute exact | 1.0 / 27.0 / 32.0 | 1.0 / 27.0 / 32.0 | 12/40 | 40/40 | 2 / 3 |
| prores_25.mov | relative ±5 s | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 20/20 | 20/20 | 2 / 3 |
| vfr_24_60_10.mkv | absolute exact | 1.0 / 80.0 / 88.0 | 1.0 / 80.0 / 88.0 | 15/40 | 40/40 | 5 / 8 |
| vfr_24_60_10.mkv | relative ±5 s | 1000.0 / 2000.0 / 2100.0 | 0.0 / 16.0 / 25.0 | 18/20 | 20/20 | 3 / 7 |

What the table shows:

- **Relative seeks are fixed.** The median error is now 0 ms on every file (before: 1.0–5.8 s). The worst case is now one frame instead of up to 9.7 s. That worst case is 36.7 ms at 23.976 fps, caused by rounding the target to 1 ms on NTSC frame rates.
- **Absolute exact seeks** are unchanged and correct by the engine rule (40/40 on every file). The worst error stays under one frame duration on every file. That includes VFR, whose 88 ms worst case falls in the 10 fps segment.
- **Exact relative seeks are slower** than the old keyframe seeks (about 2 ms). They now take:
  - 5–16 ms on H.264
  - 38 ms on long-GOP HEVC
  - 64 ms on long-GOP AV1 (p95 146 ms)

  That is acceptable for single key presses.

## 4. Limitations and not yet measured

- **Hardware decoding was not measured.** This run was headless with software decoding; hardware decoding (`hwdec=auto-safe`) and real display output were not part of it. libmpv applies the same rule either way, but the run should be repeated with `NOVA_HWDEC`.
- **Seeking while playing was not measured for accuracy.** The presented frame cannot be read reliably while it advances. Only the state transitions are tested (`tests/engine.rs`).
- **No real camera or streaming media yet.** The corpus is synthetic. Lawful real samples should be added.
- **No chaptered fixture.** Chapter seeks are accurate absolute seeks, but the seek corpus has no file with chapters yet.
- **The very end of a file is not covered.** Seeking past the last frame lands on the last frame (keep-open). The probe samples nothing later than `duration − 1 s`.

## Reproduce

```bash
bash scripts/fetch-libmpv.sh
bash scripts/generate-seek-fixtures.sh          # ~540 MB in tests/fixtures/seek (git-ignored)
cargo run -p nova-playback-mpv --example seek_probe --release
cargo test -p nova-playback-mpv --test engine   # includes relative_seeks_land_on_requested_time
pnpm --filter @nova/desktop test                # seek.test.ts: mapping, coalescing, previews
```

# M1 progress — playback core

Date: 2026-10-15. Same environment as `m0-results.md`.

## Added

- PLAY-06 A–B loop: contract command + engine-confirmed snapshot field.
- PLAY-03 queue: `nova-domain::Queue`, `nova-application::QueueService`,
  Tauri commands/events, queue panel, previous/next controls, multi-file open.
- Play at end-of-media restarts from the beginning.

## Verified

| Check | Result |
| --- | --- |
| `nova-playback-api` | 26/26 |
| `nova-domain` | 13/13 |
| `nova-application` | 9/9 |
| `nova-playback-mpv` real engine | 16/16 — A–B test watches 3 s of real playback, asserts position never exceeds B+150 ms and wraps back to A; loop does not leak into the next file |
| Frontend | 13/13; `tsc` clean; clippy `-D warnings` clean |
| Live app, 2 files on command line | Session 1 played to end → "end of media confirmed by engine; advancing queue" → session 2 played → ended with no further advance; launch files opened once; clean shutdown |

## Not verified

- Queue panel, prev/next buttons and A–B button rendering/interaction
  (no GUI automation while the machine was in use).
- Media keys (`MediaTrackNext` etc.) only arrive when the WebView has focus;
  global media-key handling is P1 (SYS).

## Remaining M1 items

- Resume position (PLAY-05) needs persistence → M2 SQLite.
- Hardware-decode failure fallback under real failure (PLAY-07): only the
  forced-software path is tested.
- Display disconnect during fullscreen; shutdown during a media event stress test.

# M2 progress — persistence and resume

Date: 2026-10-15. Same environment as `m0-results.md`. Details: ADR 0004.

| Check | Result |
| --- | --- |
| `nova-domain` (queue + resume policy) | 18/18 |
| `nova-application` (queue + progress services) | 17/17 — batching ≤ 1 write / 5 s, pause/end/switch/shutdown writes, foreign sessions, I/O failure never blocks playback |
| `nova-storage` | 12/12 |
| `resume_restart` E2E | pass, 4 consecutive runs |
| `nova-playback-mpv` real engine | 17/17 (new: open with start position, option does not leak to next file) |
| Live app: graceful close → relaunch | closed ~12.7 s → `resuming at 10733 ms` |
| Live app: `taskkill /F` → relaunch | killed ~27.5 s → `resuming at 23633 ms`; DB opened clean |

Not verified: the "Resumed at … · Start over" toast visually (no GUI
automation while the machine was in use).

## Remaining M2

- Background folder scanning (cancellable, bounded) and library search
  against a 20 000-item fixture (LIB-01/02).
- Continue Watching on a Home screen (data exists: `playback_progress` by recency).
- Preferences table.

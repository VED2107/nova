# M2 results: persistence and media library

Date: 2026-10-15. Environment as in `m0-results.md`. Design: ADR 0004 and ADR 0005.

## Automated

| Suite | Result |
| --- | --- |
| `nova-domain` | 18/18 |
| `nova-application` | 17/17 |
| `nova-storage` | 22/22, plus `resume_restart` E2E 1/1. Covers v1→v2 upgrade, FTS sanitizing, overlap rules, missing/recovery, removal keeping progress, interrupted jobs, 20k search timing |
| `nova-library` | 8/8, plus 1 opt-in benchmark |
| `nova-playback-api` / `nova-playback-mpv` | 27/27; 2/2 unit + 17/17 real-engine |
| Frontend (Vitest) | 23/23, including HomeView and LibraryView component tests |
| `cargo fmt --check`, clippy `-D warnings`, `tsc` | clean |

## Measurements

| What | Result |
| --- | --- |
| Store search, 20 000 items (debug) | 6–22 ms per query |
| Scan 20 000 small files (release, SSD) | first scan 6.5 s; unchanged rescan 0.73 s |
| Search after 20k scan (release) | 3.9 ms |
| ScanManager, 600 files across 2 roots (debug) | 0.54 s |

## Live app (no input sent)

- The existing v1 database migrated to v2 at startup. The app started and shut down cleanly (logs showed `progress saved` and `engine shut down`).
- Resume worked after both a normal close and a forced kill (`taskkill /F`); tested in the earlier M2 slice.

## Not verified

- The Home and Library screens, both visually and with real mouse and keyboard input. No GUI automation was run while the machine was in use. Logic and components are tested. The Tauri commands are thin wrappers; they were exercised only indirectly, through the store and scanner tests, not through the IPC layer.
- First-scan speed on HDDs or network drives, and on very large real libraries.

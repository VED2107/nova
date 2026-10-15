# ADR 0004 — Local SQLite persistence, media identity and resume

- **Status:** Accepted (M2 start, 2026-10-15)

## Decision

- **SQLite via `rusqlite` with the `bundled` feature** (SQLite amalgamation
  compiled in; public domain). No system SQLite dependency, identical
  behavior on every machine. Database: `%APPDATA%\com.snowbros.nova\library.sqlite3`.
- **Migrations:** ordered SQL in `crates/nova-storage/src/lib.rs`, tracked by
  `PRAGMA user_version`, one transaction each. A database with a *newer*
  schema is refused and left untouched (NOVA runs without persistence).
- **Durability:** WAL + `synchronous=NORMAL`, foreign keys on, `quick_check`
  at open. A corrupt file is **moved aside** (`*.corrupt-<unix-secs>`), never
  deleted, and a fresh database is created.
- **Media identity:** path = location; identity = content fingerprint
  (FNV-1a 64 over size + first/last 64 KiB). Rules: same path+content → same
  item; same path, new content → progress discarded; known content at a new
  path whose old path is gone → moved, progress kept; known content while the
  original still exists → a copy, new item. The fingerprint is a heuristic
  (files identical in size, head and tail collide); full hashing can be added
  later for the library scanner.
- **Progress writes** never happen on the engine event thread or per frame.
  `ProgressService` decides in memory and hands records to a writer thread:
  at most every 5 s while playing, plus on pause, stop, end, file switch and
  shutdown. Worst-case loss on a crash ≈ 5 s.
- **Resume policy** (`nova-domain::progress`, pure): media < 60 s is not
  tracked; < 5 s in = nothing to resume; ≥ 95 % or ≤ 10 s left = completed
  (next open starts over); resume rewinds 2 s. The engine starts at the
  resume point via mpv's per-file `start` option, so there is no visible seek.
- **Layering:** `nova-application` defines `ProgressRepository`;
  `nova-storage` implements it. Playback never depends on the database:
  identification or I/O failures are logged and the file plays from 0.

## Evidence

- `nova-storage` 12 tests (migrations, newer-schema refusal, corrupt file,
  round-trip across reopen, moved/copied/replaced files, constraints).
- `resume_restart` E2E (real libmpv + services + SQLite file, torn down and
  rebuilt twice): resumes at 68 s after quitting at 70 s; completion makes the
  next open start at 0. Passed 4 consecutive runs.
- Live app: graceful close at ~12.7 s → resumed at 10 733 ms; **force-killed**
  at ~27.5 s → resumed at 23 633 ms (≈2–3 s lost, within the 5 s bound).

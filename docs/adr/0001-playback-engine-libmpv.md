# ADR 0001 — libmpv as the first playback engine, behind a narrow contract

- **Status:** Accepted (M0, 2026-10-15)
- **Deciders:** NOVA engineering

## Context

NOVA must play a broad range of local media reliably on Windows first, without
writing a decoder. The handoff specifies a hybrid architecture: a
backend-neutral playback API with libmpv as the initial backend.

## Decision

1. `crates/nova-playback-api` defines the contract: `PlaybackCommand`,
   `PlaybackSnapshot`, `PlaybackError`, `Capabilities`, the
   `PlaybackBackend` trait and a **pure state reducer** (`PlaybackState`).
   It depends only on `serde` and `thiserror`.
2. `crates/nova-playback-mpv` implements the contract with libmpv.
3. **libmpv is loaded at runtime** (`libloading`) with hand-written bindings
   for ~17 functions of `client.h` (API 2.x), rather than linked via the
   `libmpv2` crate.
4. The phase is **derived** from observed engine facts (file-loaded,
   playback-restart, seek, pause, eof, end-file). The UI never infers state;
   commands return only an acknowledgement and results arrive as snapshots.
5. Every `Open` creates a **session id**. libmpv `playlist_entry_id`s are
   mapped to sessions under a lock held across `loadfile`, so stale events
   from a superseded file are discarded by the reducer.

## Why runtime loading instead of `libmpv2`

- The available Windows builds are MinGW; linking from MSVC needs a generated
  import library. Runtime loading needs nothing at build time.
- A missing/incompatible DLL becomes a typed `EngineUnavailable` error shown
  in the UI instead of a process that fails to start.
- The engine stays a separate, replaceable file, which matters for the
  licensing options in ADR 0003.
- The surface is small (verified against the vendored `client.h`,
  `MPV_CLIENT_API_VERSION 2.5`); the API major version is checked at load.

Trade-off: we own the `unsafe` FFI. It is confined to `ffi.rs`/`node.rs` and
covered by the integration suite against the real library.

## Engine isolation settings

`config=no`, `load-scripts=no`, `ytdl=no`, `osc=no`, `input-default-bindings=no`,
`input-vo-keyboard=no`, `terminal=no`: a user's mpv configuration, scripts or
network helpers can never change NOVA's behaviour. Only local file paths are
accepted (`MediaSource`), and commands are passed as argument arrays
(`mpv_command`), never parsed command strings.

## Consequences

- Future backends must pass the same contract tests
  (`crates/nova-playback-mpv/tests/engine.rs` is the seed of that suite).
- mpv's `keep-open=yes` is used: at end of media the last frame stays and
  the phase is `Ended`; `Play` at `Ended` restarts from 0.

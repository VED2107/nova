# Playback contract

Source of truth: `crates/nova-playback-api/src/lib.rs`. The TypeScript mirror
is `apps/desktop/src/services/playback/types.ts` (hand-maintained for now).

## Flow

```text
React UI ──invoke("playback_execute", {command})──▶ Tauri command
                                                      │ validate (PlaybackCommand::validate, MediaSource)
                                                      ▼
                                              PlaybackBackend::execute ──▶ libmpv (argument arrays only)
                                                      │ returns CommandAck {sessionId}  (request accepted, not done)
libmpv events ──▶ event thread ──▶ EngineEvent ──▶ PlaybackState::apply(session, event)
                                                      │ changed? → snapshot (seq+1)
React store ◀──emit("playback://snapshot")────────────┘ drops snapshots with seq ≤ current
```

## Rules

- The UI renders only `PlaybackSnapshot`s. It never sets phase, position or
  track selection optimistically.
- `phase` is derived, not stored: `Idle`, `Loading` (until file loaded **and**
  playback restarted), `Playing`/`Paused`, `Seeking` (until playback restarts),
  `Ended`, `Stopped`, `Error`.
- Each `Open` starts a new session; events for older sessions are ignored.
  Volume, mute and speed are player-wide and survive session changes.
- Position-only updates are coalesced to ≤ 10 Hz; all other changes emit
  immediately.
- Track ids are `video:N`, `audio:N`, `sub:N`; anything else is rejected
  before reaching the engine.
- Only absolute local file paths are accepted in M0.

## JSON examples

```json
{ "type": "seek", "positionMs": 20000, "exact": true }
{ "type": "selectSubtitleTrack", "trackId": null }
```

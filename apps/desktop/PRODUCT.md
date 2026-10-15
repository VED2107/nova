# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

The UI is React in a Tauri 2 WebView on Windows; macOS and Linux are later. It is a desktop app, not a website. The video is a native libmpv surface underneath a transparent WebView.

## Users
- **Primary: everyday viewers.** They open a file, watch it, come back later and find it again.
- **Secondary, served one step deeper: professionals.** Editors, camera operators and colorists who need to check demanding footage (ProRes, DNx, XAVC-style MXF, HDR, 4K/8K) and see what the engine actually decoded.
- Students navigating lectures (speed, A–B loop), power users who want shortcuts and diagnostics, and collectors managing large folders.

Confirmed by the user: viewers first, with pro depth.

## Product Purpose
NOVA is a privacy-first, open-source desktop media player from SNOWBROS. Its core journey: open a file → playback starts fast → control it effortlessly → resume later → find it again. Success means playback is dependable across consumer and professional formats, and the app is one people choose because they enjoy using it.

## Positioning
NOVA is a player that is honest about media. Every playback state shown is engine-confirmed. File contents decide what a file is, not its extension. Unsupported camera RAW formats and editing projects are explained, not failed silently. Pro diagnostics (codec, bit depth, chroma, HDR, decoder) are readable. It works fully offline, with no account and no telemetry.

## Operating Context
- **Using it:** local files opened from the file picker, drag-and-drop or "Open with". A library of user-selected folders, scanned in the background. A play queue. Watching in a window or fullscreen, often in a dark room.
- **Interaction:** keyboard-heavy for power users. The mouse is used for browsing.
- **Displays:** Windows display scaling and multiple monitors are expected. Hybrid GPUs are common (Intel + NVIDIA on the reference machine).

## Capabilities and Constraints
- **Playback, all engine-confirmed:**
  - Play/pause, exact seeking, volume and mute, speed 0.25–4×
  - Audio and subtitle track selection, A–B loop, fullscreen
  - Hardware decoding with software fallback
- **Queue:** next/previous, auto-advance, reorder, remove, append.
- **Resume:** persisted in SQLite; moved files keep their progress.
- **Library:** folders, cancellable scans, FTS search, missing-file handling, Continue Watching, Recently added.
- **Diagnostics:** engine `MediaDetails` and decoder issues; editing-project and camera-RAW detection with guidance.
- **Not yet built (do not imply otherwise):**
  - Saved playlists, thumbnails or durations in the library at the start of this phase
  - Image sequences, embedded timecode, a settings store
- **Licensing:** unresolved (ADR 0003). No public distribution yet.

## Brand Commitments
- **Name:** NOVA by SNOWBROS.
- **Identity:** the Lumen N mark and wordmark (`brand/`), built with the logo-design skill. Its N's diagonal beam is "light passing through".
- **Palette:** cream `#F7F4EE`, ink `#171715`, ember `#F97316`, grey `#92928B`, as established in the handoff. Ember on cream is not a text colour (about 2.8:1).
- **Not affiliated:** never imply affiliation with VLC, mpv or other projects.

## Evidence on Hand
- A real engine; the synthetic media corpus (`tests/fixtures`); compatibility results (`docs/compat`).
- No user testimonials, usage numbers or press exist. Never fabricate them, and never show fake media in the UI.

## Product Principles
1. The video is the subject. Interface recedes while watching and returns on intent.
2. Show only what the engine confirms. Unknown and unavailable are different and are labelled differently.
3. Simple by default, deep on request. Pro information is one deliberate step away, never in the way.
4. Explain, don't fail. Every unsupported state names the reason and a next step.
5. Private by construction. Local only, no accounts, nothing leaves the machine.

## Accessibility & Inclusion
- **Standard:** WCAG 2.2 AA (confirmed: "all").
  - Text contrast ≥ 4.5:1, and ≥ 3:1 for UI components and large text.
- **Keyboard:** full operation of essential tasks, with visible focus.
- **Screen readers:** accessible names on every control.
- **Motion and scaling:** respect reduced-motion; support system scaling and text scaling.

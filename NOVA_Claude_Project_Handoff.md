# NOVA --- Claude Project Handoff

**Owner:** SNOWBROS\
**Working name:** NOVA\
**Document type:** Product specification, architecture brief,
implementation plan, and execution prompt\
**Status:** Proposed baseline --- validate decisions before large-scale
implementation

------------------------------------------------------------------------

## 0. How to use this document

Give this entire file to Claude as the primary project brief. Ask Claude
to:

1.  Read the specification fully.
2.  Inspect the existing repository and development environment before
    changing files.
3.  Identify assumptions, conflicts, and decisions that require
    validation.
4.  Propose a short, evidence-based implementation plan for the next
    milestone.
5.  Implement incrementally, run the relevant tests, and report actual
    results.
6.  Update the documentation when a decision changes.

**Do not ask Claude to generate the entire application in one pass.**
The first goal is a working, tested Windows playback vertical slice. Do
not build future features before proving the media-engine and
video-rendering architecture.

### Operating rules for implementation

-   Never claim tests passed unless they were actually run and their
    output was checked.
-   Do not invent APIs, library capabilities, benchmark results, or
    compatibility claims.
-   Before selecting a dependency or bundling native libraries, inspect
    current documentation and licenses.
-   Prefer small, reviewable changes over large rewrites.
-   Preserve working behavior and inspect the repository before
    overwriting or restructuring anything.
-   Keep a running list of known limitations, risks, and follow-up work.
-   Use architecture decision records (ADRs) for major choices.
-   Treat this file as the product baseline, but resolve contradictions
    with evidence and document the resolution.

------------------------------------------------------------------------

# 1. Product vision

NOVA is a modern, privacy-first, open-source, cross-platform media
player from SNOWBROS. It should combine mature media playback with a
distinctive interface, a useful local media library, transparent
diagnostics, and thoughtful automation.

**Product principle: own the experience; reuse proven media technology
where it makes engineering sense.**

NOVA is not intended to be a superficial VLC reskin. It needs its own
product identity, application architecture, interaction model, release
discipline, and test strategy.

### Product goals

1.  Reliably play a clearly defined and thoroughly tested range of local
    media formats.
2.  Make ordinary playback intuitive while preserving advanced controls
    for power users.
3.  Make personal media collections easy to scan, search, organize, and
    resume.
4.  Work offline without an account or mandatory cloud service.
5.  Keep application/domain logic sufficiently independent of any single
    playback engine.
6.  Establish clear open-source licensing, dependency tracking, and
    reproducible release practices.
7.  Expand from Windows to macOS and Linux after the core architecture
    is proven.

### Initial platform strategy

-   **First:** Windows 10/11, with the actual supported versions and
    hardware matrix documented.
-   **Next:** macOS and Linux.
-   **Later, separately validated:** Android, iOS, TVs, casting, and
    other devices.

Do not promise all-platform parity in the first release. Desktop-first
is a deliberate scope decision.

### Non-goals for the first release

-   Writing a video decoder from scratch.
-   Replacing a complete media server such as Plex or Kodi.
-   Requiring a user account, subscription, advertisements, or internet
    access for basic playback.
-   Cloud-based analysis of private media.
-   Arbitrary native plugin loading.
-   Mobile/TV support before desktop playback is stable.
-   DRM-protected streaming unless separately scoped and legally
    reviewed.

------------------------------------------------------------------------

# 2. Target users

  -----------------------------------------------------------------------
  User                    Main need               Product response
  ----------------------- ----------------------- -----------------------
  Everyday viewer         Open a file and watch   Fast opening, clear
                                                  controls, resume

  Film enthusiast         Control subtitles,      Advanced playback
                          audio, aspect ratio,    controls and inspector
                          and playback            

  Student                 Navigate lectures and   Speed control,
                          recordings              bookmarks, A--B loops;
                                                  transcripts later

  Power user              Understand playback and Codec/decoder
                          configure behavior      diagnostics, shortcuts,
                                                  advanced settings

  Media collector         Manage large folders    Indexing, search,
                                                  filters, playlists,
                                                  metadata and artwork
  -----------------------------------------------------------------------

Primary user journey:

**Open file → start playback quickly → control it effortlessly → resume
later → find it again.**

------------------------------------------------------------------------

# 3. Product requirements

Priority levels: - **P0:** required for the first usable Windows
release. - **P1:** required for a strong public desktop release. -
**P2:** later expansion.

## 3.1 Playback

  -------------------------------------------------------------------------------
  ID                Requirement               Priority          Acceptance
                                                                criteria
  ----------------- ------------------------- ----------------- -----------------
  PLAY-01           Open files through file   P0                Valid test files
                    picker, drag-and-drop,                      open without
                    and supported OS                            manual
                    file-open flows                             configuration

  PLAY-02           Play, pause, seek,        P0                UI and keyboard
                    volume, mute, fullscreen                    controls work
                                                                consistently

  PLAY-03           Queue and multi-file      P0                Queue order and
                    playlists                                   next/previous
                                                                behavior are
                                                                correct

  PLAY-04           Select available          P0                Available tracks
                    audio/subtitle tracks and                   are presented
                    disable subtitles                           with useful
                                                                labels

  PLAY-05           Resume eligible media     P0                Position persists
                                                                across
                                                                application
                                                                restarts

  PLAY-06           Playback speed and A--B   P0                State changes
                    loop                                        apply without
                                                                restarting
                                                                playback

  PLAY-07           Hardware decoding where   P0                Failures are
                    supported, with a tested                    handled without
                    fallback                                    permanent hangs

  PLAY-08           Robust handling of load,  P0                State remains
                    seek, end-of-file, and                      valid during
                    shutdown races                              repeated
                                                                transitions

  PLAY-09           Aspect ratio, subtitle    P1                Controls work on
                    delay, audio delay, and                     declared
                    frame stepping                              supported
                                                                backends

  PLAY-10           Audio                     P2                Only implement
                    normalization/equalizer                     after core
                    profiles                                    playback quality
                                                                is established
  -------------------------------------------------------------------------------

## 3.2 Media library

  ---------------------------------------------------------------------------
  ID                Requirement           Priority          Acceptance
                                                            criteria
  ----------------- --------------------- ----------------- -----------------
  LIB-01            Scan user-selected    P0                Scanning does not
                    folders in background                   freeze the UI

  LIB-02            Search, sort, and     P0                Responsive
                    filter                                  against a
                                                            20,000-item test
                                                            fixture

  LIB-03            Recently played,      P1                State survives
                    favorites, and watch                    restart
                    progress                                

  LIB-04            Artwork, metadata,    P1                Missing metadata
                    genres, collections                     never prevents
                                                            playback

  LIB-05            Detect moved/missing  P1                User can
                    files and duplicate                     understand and
                    records                                 recover from the
                                                            state

  LIB-06            Smart playlists       P2                Rules are
                                                            documented and
                                                            deterministic

  LIB-07            Batch                 P2                Destructive
                    organization/rename                     operations are
                    with preview and undo                   safe and
                                                            reversible where
                                                            possible
  ---------------------------------------------------------------------------

## 3.3 Diagnostics and quality of life

  -------------------------------------------------------------------------
  ID                Requirement       Priority          Acceptance criteria
  ----------------- ----------------- ----------------- -------------------
  DIAG-01           Playback          P1                Shows
                    inspector                           available/active
                                                        codec, decoder,
                                                        renderer, and
                                                        meaningful
                                                        statistics

  DIAG-02           Actionable errors P1                Explains likely
                                                        issue and safe next
                                                        steps

  UX-01             Custom keyboard   P1                Conflicts are
                    shortcuts                           detected; defaults
                                                        can be restored

  UX-02             Subtitle          P1                Changes apply
                    appearance and                      during playback
                    timing                              

  SYS-01            Single-instance   P1                Opening another
                    behavior and file                   file routes
                    associations                        correctly

  SYS-02            Safe update flow  P1                Update verification
                                                        and failure
                                                        handling are tested

  INT-01            Local transcript  P2                Results link to
                    search                              verified timestamps

  SYNC-01           Optional          P2                Offline changes and
                    cross-device                        conflicts are
                    state sync                          handled
                                                        deterministically

  EXT-01            Constrained       P2                Permissions and
                    extension system                    trust boundaries
                                                        are documented
  -------------------------------------------------------------------------

## 3.4 Non-functional targets

These are proposed targets, not existing measurements. Validate them on
named reference hardware and a documented media corpus.

-   Cold start p95 ≤ 2.5 seconds on reference PC, excluding first-run
    scanning.
-   Local 1080p H.264 playback-start p95 ≤ 1.5 seconds on the reference
    corpus.
-   Routine UI interaction p95 ≤ 100 ms under normal load.
-   Index/search a 20,000-item fixture without freezing the UI.
-   Two-hour playback soak test without unbounded memory growth.
-   No mandatory internet connection or account for core features.
-   No transmission of filenames, paths, transcripts, or playback
    history by default.
-   Keyboard accessibility, visible focus, scalable text, and
    reduced-motion support.
-   All performance claims must include environment, file corpus,
    method, and results.

------------------------------------------------------------------------

# 4. Playback state model

Implement explicit state transitions. Do not maintain unrelated booleans
in the UI as the source of truth.

States: - `Idle` - `Loading` - `Playing` - `Paused` - `Seeking` -
`Ended` - `Error` - `Stopped` (if needed by the chosen domain model)

Typical transitions:

-   Idle → Loading when opening media.
-   Loading → Playing when the engine confirms readiness and playback
    starts.
-   Loading → Error on fatal load failure.
-   Playing ↔ Paused.
-   Playing/Paused → Seeking → the correct previous intended state.
-   Playing → Ended.
-   Error → Loading on retry or an explicit fallback attempt.
-   Playing/Paused → Stopped on explicit stop.

Handle: - Opening a second file while the first is loading. - Multiple
seeks in quick succession. - Track switching while playing. - Media
being moved or removed. - Decoder failure after playback starts. -
Display disconnection during fullscreen. - App shutdown during a media
event. - Resume state recovery after crash/restart.

The engine adapter owns actual engine state. The application can request
a transition, but must not report success until it receives a
corresponding engine event or confirmed state.

------------------------------------------------------------------------

# 5. Architecture

## 5.1 Chosen direction

Use a **hybrid playback architecture** with a narrow playback interface.
Begin with libmpv for desktop playback. Introduce another backend only
when a demonstrated requirement justifies it.

Do not start by writing a decoder from scratch. First prove that the
chosen video-rendering approach works reliably within the Tauri/Windows
architecture.

## 5.2 Technology baseline

  -----------------------------------------------------------------------
  Layer                   Initial choice          Notes
  ----------------------- ----------------------- -----------------------
  Desktop shell           Tauri 2                 Verify native video
                                                  rendering and window
                                                  integration early

  UI                      React + TypeScript      Typed components and
                                                  application state

  Styling                 Tailwind CSS + design   Consistent visual
                          tokens                  system

  Motion                  Motion, selectively     Avoid animation work
                                                  during critical
                                                  playback paths

  Native services         Rust                    Domain orchestration,
                                                  scanning, persistence,
                                                  platform services

  Playback backend        libmpv initially        Encapsulated behind
                                                  adapter

  Database                SQLite                  Local-first persistent
                                                  state

  Search                  SQLite indexes; FTS     Do not add an external
                          where useful            search service
                                                  prematurely

  Testing                 Rust tests, Vitest,     Add actual media
                          Playwright, native      playback tests
                          integration tests       

  Packaging               Platform-specific       Signing and OS
                          installers/packages     integration
  -----------------------------------------------------------------------

This is a candidate baseline. Verify current versions, APIs, platform
support, and licensing before locking dependencies.

## 5.3 Architecture layers

1.  **Presentation:** screens, components, keyboard handling,
    accessibility.
2.  **Application:** commands, use cases, playback coordination, library
    workflows.
3.  **Domain:** media identity, playback state, playlists, preferences,
    progress rules.
4.  **Infrastructure:** SQLite repositories, filesystem scanner,
    metadata parsers, cache.
5.  **Playback API:** backend-neutral commands, snapshots, events,
    capabilities and errors.
6.  **Playback adapters:** libmpv first; future native or alternative
    backends only when justified.
7.  **Platform services:** OS file opening, media keys, window behavior,
    file associations, packaging.

### Dependency rules

-   `nova-domain` must not depend on Tauri, React, SQLite or libmpv.
-   `nova-playback-api` defines the common playback contract.
-   `nova-playback-mpv` owns native engine lifecycle and implements the
    contract.
-   `nova-application` coordinates use cases and repositories.
-   `nova-storage` implements persistence interfaces.
-   `nova-platform` contains OS-specific integration.
-   The frontend uses typed commands/events; it never calls libmpv
    directly.
-   Future backends must pass the same contract tests.

Do not create a separate crate for every small module. Boundaries should
enable testing or replacement, not add ceremony.

## 5.4 Repository layout

``` text
nova/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── app/
│       │   ├── features/
│       │   │   ├── player/
│       │   │   ├── library/
│       │   │   ├── playlists/
│       │   │   ├── search/
│       │   │   └── settings/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── services/
│       │   └── styles/
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── commands/
│       │   │   ├── application/
│       │   │   ├── domain/
│       │   │   ├── infrastructure/
│       │   │   └── main.rs
│       │   ├── capabilities/
│       │   └── Cargo.toml
│       └── package.json
├── crates/
│   ├── nova-domain/
│   ├── nova-application/
│   ├── nova-media/
│   ├── nova-library/
│   ├── nova-metadata/
│   ├── nova-storage/
│   ├── nova-platform/
│   ├── nova-playback-api/
│   ├── nova-playback-mpv/
│   └── nova-testkit/
├── packages/
│   ├── ui/
│   ├── design-tokens/
│   └── contracts/
├── tests/
│   ├── fixtures/
│   ├── playback/
│   ├── performance/
│   ├── security/
│   └── e2e/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── product/
│   ├── testing/
│   └── release/
├── scripts/
├── .github/workflows/
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
└── README.md
```

Adapt the structure to actual framework conventions when implementation
begins. Do not create empty scaffolding for future features unless it
provides immediate value.

## 5.5 Playback API

Define a typed interface around intent and observed state. Example
conceptual API:

``` rust
pub type SessionId = String;

pub enum PlaybackCommand {
    Open { uri: String },
    Play,
    Pause,
    Stop,
    Seek { position_ms: u64 },
    SetVolume { percent: u8 },
    SetSpeed { multiplier: f64 },
    SelectAudioTrack { track_id: String },
    SelectSubtitleTrack { track_id: Option<String> },
}

pub enum PlaybackPhase {
    Idle,
    Loading,
    Playing,
    Paused,
    Seeking,
    Ended,
    Error,
}

pub struct PlaybackSnapshot {
    pub session_id: SessionId,
    pub phase: PlaybackPhase,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub speed: f64,
    pub volume_percent: u8,
    pub is_muted: bool,
}
```

This is illustrative, not production-ready. Implementation must add
typed media URIs, validation, structured failures, capabilities, event
sequencing, cancellation and session IDs to prevent stale events
affecting a new file. Use a well-defined media-time representation and
monotonic timing for duration calculations.

## 5.6 Rendering spike: critical architecture gate

Before implementing the whole app, prove:

1.  A real local video renders in the intended window.
2.  Audio and video remain synchronized.
3.  Seeking and resizing behave correctly.
4.  Fullscreen enter/exit works.
5.  The UI remains responsive while decoding.
6.  Shutdown and reopen do not leak engine resources.
7.  The selected integration can be packaged and run on a clean Windows
    machine.
8.  The integration's license and redistribution obligations are
    understood.

If native rendering is awkward inside the WebView, compare an embedded
native surface, a dedicated native player window, or a different
shell/rendering strategy. Record the decision in an ADR before
proceeding.

------------------------------------------------------------------------

# 6. Data model

Start with a small normalized SQLite schema and versioned migrations.

Core entities:

-   `MediaItem`: id, canonical URI, file metadata, media type, duration,
    metadata status.
-   `PlaybackProgress`: media id, position, completion status, update
    time.
-   `Playlist` and `PlaylistItem`: playlist metadata and ordered
    entries.
-   `MediaTrack`: media id, track identifier, kind, codec, language and
    channel layout.
-   `UserPreference`: scope, key, validated value, update time.
-   `FileProfile`: per-file or per-series playback preferences.
-   `ScanRoot`: user-selected folder, scan status and last scan time.
-   `ScanJob`: job state, retry count, errors and cancellation status.

Rules: - Paths are locations, not permanent media identities. - File
size and modification time alone are not guaranteed unique
identifiers. - Store positions as integer milliseconds or another
documented integer time base. - Use migrations, foreign keys, indexes
and transactions. - Keep transient decoder state out of the persistent
catalog. - Handle duplicates, moved folders and inaccessible drives. -
Batch progress persistence; never write to SQLite every rendered
frame. - Cache artwork separately from core database rows. - Use
bounded, cancellable background scanning.

------------------------------------------------------------------------

# 7. UI and visual direction

Use SNOWBROS's visual identity: warm cream `#F7F4EE`, near-black
`#171715`, orange `#F97316`, and muted grey `#92928B`.

The library and settings can use a warm, editorial desktop aesthetic.
The playback surface should be immersive, uncluttered, and ideally dark.

## Main navigation

-   **Home:** Continue Watching, recently played, recent media, quick
    open.
-   **Library:** folders, collections, artwork, filters and search.
-   **Queue/Playlists:** reorder, save and manage playback order.
-   **Playback Inspector:** decoder, codec, renderer, dropped frames and
    diagnostics.
-   **Settings:** playback, appearance, library, shortcuts, privacy and
    advanced options.

## UI acceptance requirements

-   Video is the primary focus during playback.
-   Controls appear on interaction and can remain visible when
    requested.
-   Fullscreen uses the intended display and exits reliably.
-   Track labels show useful language/codec information.
-   Errors offer recovery steps, not just raw technical text.
-   Destructive operations are confirmed and reversible where practical.
-   Search supports keyboard use and meaningful empty states.
-   Advanced controls are contextual and searchable.
-   Support system scaling, reduced motion, keyboard navigation and
    accessible labels.
-   Never claim a setting is active until the engine confirms it.

Do not design only static mockups. The actual controls must work against
real application state.

------------------------------------------------------------------------

# 8. Signature features and roadmap

## P0 --- First usable release

-   Reliable local playback and queue.
-   Audio/subtitle track selection.
-   Seeking, speed, A--B loop, volume and fullscreen.
-   Hardware decoding with tested fallback.
-   Resume progress.
-   Background folder indexing and search.
-   Keyboard shortcuts and structured error reporting.
-   SQLite persistence, packaging and baseline accessibility.

## P1 --- Strong public desktop release

-   Metadata, artwork and useful library views.
-   Favorites, history and smart filters.
-   Subtitle appearance and synchronization.
-   Playback inspector and actionable diagnostics.
-   File associations and single-instance routing.
-   Installer, update, signing, crash-safety and privacy documentation.

## P2 --- Differentiation

1.  **Adaptive Playback Assistant:** identify dropped frames, decoder
    failures and audio problems; offer explainable, reversible
    suggestions.
2.  **Local transcript search:** optional local speech-to-text with
    timestamped results.
3.  **Per-file profiles:** remember speed, tracks, subtitles and other
    playback settings.
4.  **Media handoff:** QR pairing and local-network transfer/resume.
5.  **Cross-device state sync:** optional synchronization of progress,
    playlists and bookmarks.
6.  **Creator mode:** frame export, technical inspection and timestamp
    comparison.
7.  **Constrained extensions:** only after a permission model and
    security boundary are defined.

Do not implement all P2 features before P0 and P1 are stable. Validate
demand with users before committing to cloud services or a large plugin
system.

------------------------------------------------------------------------

# 9. Implementation milestones

Indicative timeline for one experienced developer; actual progress
depends on rendering integration, media compatibility, packaging, and
testing.

## M0 --- Weeks 1--2: Foundation and technical spike

-   Inspect environment and establish repo.
-   Build Tauri/React/Rust shell.
-   Integrate libmpv and prove native video rendering.
-   Open a local file and handle engine lifecycle.
-   Establish CI and initial license inventory.
-   Record ADRs for engine, rendering and licensing.

**Exit:** clean development build plays a real test file and shuts down
cleanly.

## M1 --- Weeks 3--4: Playback core

-   Implement adapter, command/event contract and state machine.
-   Add play/pause, seeking, volume, fullscreen, tracks and speed.
-   Handle failure, cancellation and repeated file switching.
-   Add core playback tests.

**Exit:** core controls work and deterministic adapter tests pass.

## M2 --- Weeks 5--7: Library and persistence

-   Add SQLite schema/migrations and repositories.
-   Implement cancellable background scanning and metadata extraction.
-   Add search, sorting, progress, playlists and preferences.
-   Handle missing files and interrupted scans.

**Exit:** library fixture meets agreed responsiveness target and state
persists across restarts.

## M3 --- Weeks 8--9: UX and diagnostics

-   Finish library, player and settings screens.
-   Add subtitle styling/synchronization.
-   Build playback inspector.
-   Add keyboard, accessibility and OS integration.

**Exit:** representative user workflows pass end-to-end tests.

## M4 --- Weeks 10--12: Windows beta

-   Run compatibility, stress, security and regression suites.
-   Add installer, signing, checksums and release automation.
-   Review licenses and publish notices.
-   Test clean install, upgrade, failure recovery and uninstall.
-   Publish known limitations and support matrix.

**Exit:** Windows beta passes release gates.

## M5 --- After beta: macOS and Linux

-   Port platform services and packaging.
-   Validate rendering, audio, decoding and OS interactions.
-   Run the same playback contract tests on each supported platform.
-   Document feature differences honestly.

## M6 --- Later: Intelligence and ecosystem

-   Local transcripts and timestamped search.
-   More advanced diagnostics.
-   LAN pairing, media transfer and optional synchronization.
-   Extensions and additional platforms only after user demand is
    established.

------------------------------------------------------------------------

# 10. Testing strategy

A UI test alone cannot prove that video renders correctly or audio stays
synchronized.

## Test layers

1.  **Unit:** domain rules, state transitions, validation, playlist
    logic and progress.
2.  **Contract:** every playback backend implements the common API.
3.  **Integration:** native engine, SQLite, filesystem scanner and
    application commands.
4.  **Frontend:** controls, error states, keyboard behavior and
    accessibility.
5.  **End-to-end:** open, play, pause, seek, switch tracks, close and
    resume.
6.  **Stress:** long playback, repeated switching, large queues,
    interrupted scans.
7.  **Security:** malformed metadata, unsafe URLs, path traversal
    attempts, permission boundaries.
8.  **Release:** install, update, rollback and uninstall on clean
    systems.

## Media corpus

Maintain a versioned, legally distributable corpus with known expected
outcomes. Include:

-   H.264 and representative HEVC, VP9 and AV1 samples where supported.
-   MP4, MKV, WebM, MOV and other explicitly supported containers.
-   Multiple audio tracks, subtitles, language labels and subtitle
    offsets.
-   Variable-frame-rate files, unusual aspect ratios, high-resolution
    video and long files.
-   Missing metadata, malformed indexes, truncated files and invalid
    headers.
-   Hardware decoding tests on available Intel, AMD and NVIDIA systems.

Do not place commercial copyrighted films in the public test repository
without permission.

## Proposed release gates

-   No known release-blocking crash, deadlock or data-corruption defect.
-   All deterministic core state-machine and persistence tests pass.
-   Required media fixtures pass on declared reference environments.
-   Software fallback works when hardware decoding is unavailable or
    fails.
-   Two-hour playback soak completes without unbounded memory growth.
-   20,000-file fixture meets the responsiveness target.
-   No unresolved critical/high security issue.
-   License manifest, notices and source obligations are verified.
-   Installer artifacts match the recorded release version and
    checksums.

Publish a support matrix distinguishing **tested**, **supported**,
**best-effort**, and **unsupported**. Never infer universal
compatibility from a handful of successful samples.

------------------------------------------------------------------------

# 11. Open-source licensing and release

The intended distribution is open source. Before distributing binaries,
validate the exact engine build and all transitive dependencies.

-   Choose an application license only after confirming compatibility
    with the chosen dependencies and project goals.
-   MIT is a possible application-layer default, not an assumption that
    all bundled components can be distributed under MIT.
-   mpv licensing depends on build configuration; verify the selected
    libmpv build.
-   FFmpeg licensing depends on enabled components and configuration.
-   Review transitive Rust/npm dependencies, fonts, icons, artwork and
    bundled libraries.
-   Review codec patent and distribution considerations for intended
    jurisdictions.
-   Generate an SBOM, preferably SPDX.
-   Include third-party notices and preserve source/build information
    required by applicable licenses.
-   Have qualified counsel review the actual distribution configuration
    when needed.

Repository governance: - `LICENSE` - `CONTRIBUTING.md` -
`CODE_OF_CONDUCT.md` - `SECURITY.md` - `CHANGELOG.md` -
`docs/architecture/` - `docs/adr/` - `docs/testing/` - `docs/release/`

Use original NOVA branding. Do not imply affiliation with VLC/VideoLAN,
mpv, or other projects.

------------------------------------------------------------------------

# 12. CI/CD requirements

For every pull request: - Frontend format, lint and type checks. - Rust
formatting, Clippy and test suite. - Native playback adapter build and
contract tests. - Database migration tests. - Dependency vulnerability
and secret scans. - License checks and SBOM generation. - Windows build
and integration smoke tests. - macOS/Linux jobs when those ports become
supported.

For releases: - Pin engine versions and build configuration. - Package
platform-specific installers. - Sign where appropriate. - Test a clean
install and launch. - Verify update/failure handling. - Publish
checksums and release notes. - Keep a reproducible record of
dependencies and build settings.

Tauri capabilities should be minimal and explicit. Validate native
commands; do not expose arbitrary filesystem access or raw engine
commands to the frontend.

------------------------------------------------------------------------

# 13. Main risks

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Native video rendering is awkward   Prove the rendering spike before
  in Tauri                            building the rest

  Engine coupling blocks platform     Strict adapter API and conformance
  ports                               tests

  Hardware decoding differs across    Capability detection, fallback and
  systems                             real hardware tests

  Large library scans freeze UI       Bounded concurrency, cancellation
                                      and incremental indexing

  License obligations are             Audit actual build configuration
  misunderstood                       and distribution model early

  Scope expands faster than quality   P0/P1/P2 prioritization and
                                      milestone gates

  Untrusted media creates security    Defensive parsing, permissions,
  risks                               fuzzing and dependency updates

  Overdesigned interface hides        User testing, progressive
  controls                            disclosure and functional E2E tests

  Performance claims lack evidence    Reproducible benchmarks on named
                                      hardware and files
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 14. First 10 working sessions

1.  Inspect environment and existing repository; report what exists
    before changing it.
2.  Establish repository, toolchain and clean build.
3.  Integrate libmpv and render one real video.
4.  Validate audio/video synchronization, seek, resize, fullscreen and
    shutdown.
5.  Write playback API and state machine tests.
6.  Implement core controls and keyboard interactions.
7.  Add a small known-good test corpus and automated playback smoke
    suite.
8.  Add SQLite migrations and initial media repository.
9.  Add background folder scanning and library search.
10. Review results, update docs/ADRs, and choose the next milestone
    based on evidence.

These are sequencing units, not promises that every session takes one
day.

------------------------------------------------------------------------

# 15. Definition of done

A feature is not complete until: - Its user-visible behavior is
implemented. - Inputs and failure cases are validated. - Relevant
unit/integration tests pass. - Logs and diagnostics avoid unnecessary
private data. - Accessibility and keyboard behavior are considered. -
Documentation and known limitations are updated. - The app builds from a
clean checkout. - Performance is measured if the feature affects
playback, scanning or rendering. - The implementation is consistent with
architecture boundaries.

------------------------------------------------------------------------

# 16. Master prompt for Claude

You are the lead engineer for NOVA, an open-source, cross-platform media
player from SNOWBROS. Treat this handoff document as the product
baseline.

Your job is to deliver a reliable product incrementally, not to generate
a giant speculative codebase.

## Required first response

Before making broad changes:

1.  Inspect the existing repository, toolchain, OS and available
    dependencies.
2.  Summarize what already exists and what is missing.
3.  Identify the top architectural risks.
4.  Propose the smallest useful next milestone.
5.  List the exact files you intend to add/change and why.
6.  Identify any licensing or native-rendering questions that must be
    resolved first.

If the repository is empty, initialize the minimum viable workspace. If
it contains existing code, preserve working functionality and adapt the
plan.

## Implementation behavior

-   Work in small, reviewable increments.
-   Build and test after meaningful changes.
-   Run real playback tests when possible, not only mocked UI tests.
-   Never claim success without observed command output.
-   If a tool, API, package, engine feature or platform capability is
    uncertain, inspect its actual documentation and verify it
    experimentally.
-   Do not silently substitute a mock player or placeholder for real
    media playback.
-   Keep native engine lifecycle, UI state and persistent state
    separate.
-   Keep the application functional offline.
-   Add no telemetry or cloud upload of private media by default.
-   Do not implement P2 features before P0 playback and library
    foundations are stable.
-   Record significant decisions in `docs/adr/`.
-   Keep `README.md`, test instructions, known limitations and this plan
    updated.
-   At each milestone, report changed files, commands actually run, test
    results, known defects, and the next recommended task.

## Immediate task

Start with **M0: architecture and rendering feasibility**.

Prove that the intended Tauri/React/Rust desktop architecture can host
libmpv and render real video reliably on Windows. Validate lifecycle,
synchronization, seeking, resize, fullscreen, shutdown, packaging
feasibility, and licensing. Then implement the smallest real playback
vertical slice.

Do not build the entire roadmap in the first pass. Stop at the first
meaningful milestone, report evidence, and proceed incrementally.

**Success means a working, tested, maintainable product---not merely a
polished mockup or a large volume of generated code.**

# NOVA mobile: modules, milestones and test plan

Companion to [ADR 0007](../adr/0007-mobile-architecture.md). Status as of 2026-10-18:

- **M1 (desktop seeking)** is implemented.
- **The M2/M3 Expo Go prototype** is built. Its JS bundles compile for iOS and Android, and the web render was checked at phone sizes.
- **It has not yet been run on a physical device.**

## Shared vs platform-specific modules

| Module | Where | Shared? |
|---|---|---|
| Design tokens, icon paths, brand marks | `apps/mobile/src/design`, `components/icons.tsx` (source: desktop CSS and `brand/`) | Values shared; implementation per platform |
| Seek policy: mapping, coalescing, fine-scrub rate, tap zones, chapter targets | `apps/mobile/src/core/seek.ts` (port of `apps/desktop/src/services/playback/seek.ts`) | **Shared logic.** M4: one package |
| Time and language formatting | `core/time.ts` | Shared |
| Playback contract | `playback/types.ts` (mirror of `crates/nova-playback-api`) | Shared contract |
| Preferences schema (closed value sets) | `core/prefs.ts` (desktop equivalent: `nova-storage/src/extras.rs`) | Pattern shared, keys per platform |
| Library and history | `core/library.ts` (AsyncStorage) | M4: SQLite (`expo-sqlite`) with a schema shared with `nova-storage` |
| System engine adapter | `playback/useSystemEngine.ts` (expo-video) | Per platform inside expo-video |
| libmpv engine module | **Android: built** — `apps/mobile/modules/nova-mpv` (Kotlin, Expo Modules API, `dev.jdtech.mpv:libmpv`), JS adapter `playback/useMpvEngine.ts`. iOS: not planned for now | Android |
| File access | iOS document picker and security-scoped bookmarks; Android SAF (`ACTION_OPEN_DOCUMENT`, persisted URI permissions) | Per platform |
| Media session, lock screen, audio focus and interruptions, PiP, AirPlay | Native in each engine module | Per platform |

## File access: iOS and Android differ

- **iOS:** NOVA sees only what the user picks (Files and its providers, iCloud Drive). It cannot scan the device.
  - With `copyToCacheDirectory` (used in the prototype), a picked file is **copied** into the app cache. Large files take time and space, and the cache can be purged, which leaves "unavailable" entries.
  - M4 replaces the copy with security-scoped bookmarks and folder picks (`UIDocumentPickerViewController` for folders) where the provider supports them.
- **Android:** SAF gives per-file or per-tree access that survives restarts through persisted URI permissions. NOVA will not ask for `READ_MEDIA_VIDEO` or "all files" access. Picking a folder lets NOVA index that tree without broad permissions.
- **Both:** files can move or disappear (an external provider goes offline, an SD card is removed). The library marks them unavailable and keeps their progress; it never deletes them silently.

## Background, interruptions, routes (decided behaviour)

| Event | Video playing | Audio-only file |
|---|---|---|
| App backgrounded / screen locked | Pause. PiP continues if the user started it (system engine) | Continue **only after** background audio is built and tested (M4). Expo Go cannot |
| Phone call / Siri / alarm | Pause; do not auto-resume | Pause; resume if the system signals it should |
| Headphones disconnected | Pause (both OS conventions) | Pause |
| Route change to AirPlay / Cast | System engine: native. libmpv: not supported (stated in UI) | Same |

The prototype sets `staysActiveInBackground = false` and does not claim any background behaviour.

## Milestones

| | Content | Exit criteria | Status |
|---|---|---|---|
| M0 | Audit, seek diagnosis, this plan, ADR 0007 | Documents reviewed by the owner | Done; awaiting review |
| M1 | Desktop seek fixes | seeking.md criteria. Engine: met. UI: unit-tested, **visual check pending** | Implemented |
| M2a | App on the system engine (Expo Go, Android APK) with desktop UI and feature parity where the engine allows | Runs from a QR code on the owner's iPhone; signed APK | **Released as mobile 0.1.0 (pre-release)**. The owner ran it on an iPhone; the APK is not yet installed on a device |
| M2b | libmpv engine module (iOS via an LGPL MPVKit-style build, Android via an LGPL libmpv) in an Expo development build | Corpus plays, exact-seek probe on device, subtitles (ASS/PGS), hardware decoding, licence configuration recorded | Not started |
| M2c | Engine comparison on one corpus | Table per platform: formats, seek error distribution, HDR, PiP, battery (30 min runs), heat | Not started |
| M3 | Design review on real phones and tablets | Owner sign-off on player, timeline, library; accessibility pass (VoiceOver, TalkBack, Dynamic Type at 200 %) | Not started |
| M4 | Shared core extraction, SQLite library, folder access, background audio, media session | Feature tests per platform | Not started |
| M5 | Beta: device matrix, performance, licence report | Below | Not started |
| M6 | Store readiness | Listings, privacy labels, notices, install/upgrade/uninstall tests | Not started |

## Expo Go prototype: acceptance checklist (owner, on device)

- [ ] `npm run start` in `apps/mobile` shows a QR code.
- [ ] Expo Go on the iPhone opens NOVA (no Apple Developer account).
- [ ] Library: scrolls, search filters, sort works, demo items open the "demo listing" sheet, not the player.
- [ ] Test card plays with sound. Tapping toggles controls; controls hide after about 3 s.
- [ ] Drag the timeline: the bubble shows time.frame and a delta; the picture follows. On release, the frame number burned into the video matches the time (±1 frame).
- [ ] Slide the finger up while dragging: "Half/Quarter-speed scrubbing" appears and the movement slows.
- [ ] Double-tap left and right: ∓10 s with the amount shown. Repeated taps accumulate.
- [ ] Audio & subtitles sheet: switching between the two audio tracks and the two subtitle tracks works.
- [ ] Rotate: the layout holds in landscape; the sheets dock right; nothing is clipped by the notch or home indicator.
- [ ] Lock: only "Hold to unlock" responds.
- [ ] Settings: light, dark and system themes; changing the skip amount updates the buttons.
- [ ] Open from Files: an MP4/MOV from the phone plays. An MKV shows the explained error.
- [ ] Fast Refresh: edit a string in `src/app/index.tsx`; the phone updates without a reload.

## Device test plan (M3–M5)

| Platform | Devices (minimum) | Why |
|---|---|---|
| iOS | Oldest supported iPhone for the SDK (A12/A13 class), iPhone with notch, iPhone 15 Pro or later (AV1 hardware, ProMotion), iPhone SE (small screen), iPad (split view) | Decoder generations, refresh rates, safe areas |
| Android | Low-end (4 GB RAM, MediaTek), Pixel (reference), Samsung flagship (Exynos/Snapdragon decoder quirks), tablet or foldable | MediaCodec variance, memory pressure, large screens |

Measure per device: seek error distribution (probe on the test card and corpus), dropped frames, start-up time, memory, 30-minute battery and temperature at 1080p H.264 and 4K HEVC.

## Apple account: what needs what

| Stage | Needs |
|---|---|
| Expo Go preview (now) | iPhone with Expo Go from the App Store, same network (or `--tunnel`). **No Apple Developer account, no Mac, no Xcode.** |
| Development build with native modules (libmpv) | A Mac with Xcode and a free Apple ID (7-day device installs, limited), **or** EAS Build plus a **paid** Apple Developer membership for device builds |
| TestFlight, App Store | Paid membership, App Store Connect, privacy labels, export compliance |

Android at every stage: no paid account until Play publishing (one-time Play Console fee). Development builds install as APKs.

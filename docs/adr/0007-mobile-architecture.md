# ADR 0007 — NOVA on Android and iOS: app stack and playback engines

- **Status:** Proposed, 2026-10-18. The UI stack is accepted for the prototype. The engine choice is **pending M2 measurements**.
- **Scope:** phones and tablets. The Windows app, its updater and its release flow are unchanged.
- **Not legal advice.** The licensing sections need counsel before any store submission.

## Context: what exists and what can move

An audit of `main` (3731b03) sorted the code by where it can go:

| Area | Today | Portable to mobile? |
|---|---|---|
| `nova-domain` (queue, resume policy) | Pure Rust | **Yes**, logic only. It needs FFI (UniFFI) to reach Swift/Kotlin, or a TS port. |
| `nova-application` (queue/progress services over ports) | Pure Rust | Yes, same as above |
| `nova-playback-api` (contract and state reducer) | Pure Rust | Yes. It is the reference for the mobile contract (`apps/mobile/src/playback/types.ts`). |
| `nova-storage` (SQLite, media identity via file hashing) | Rust + rusqlite | Partly. Identity hashing assumes paths and random file access. iOS security-scoped URLs and Android SAF `content://` URIs need platform adapters. |
| `nova-library` (folder scanner) | Walks directories | **No** on iOS: there is no folder scanning outside the app sandbox or user-picked folders. On Android it would have to be rewritten on top of SAF tree URIs. |
| `nova-playback-mpv` | Loads `libmpv-2.dll` at runtime, renders through `wid` into a Win32 child window | **No.** This is a Windows binary and Windows window embedding. The FFI shape and the event loop are reusable ideas, not reusable code. |
| `apps/desktop/src-tauri` (z-order, previews, updater) | Tauri 2 + Win32 | No. The updater model (signed `latest.json` and self-replacement) is not allowed on either app store. |
| `apps/desktop/src` (React UI) | WebView over native video | **No** as a UI. Pure modules port: seek policy, actions, time formatting. |
| Brand, tokens, icon family | CSS variables, SVG | **Yes**, as tokens and paths (done: `apps/mobile/src/design/tokens.ts`, `components/icons.tsx`). |

The shipped Windows engine is a **GPL** build (ADR 0003, option A). **No part of that binary can ship on mobile.**

## Decision 1 — app stack: Expo + React Native, with native engine modules

Two realistic options:

| | A. Expo/React Native UI on both platforms, with native playback modules (Swift, Kotlin) | B. Expo for prototypes only, then native apps (SwiftUI + Jetpack Compose) |
|---|---|---|
| Owner previews on an iPhone without an Apple account | **Yes** (Expo Go now; development builds later) | Only the throwaway prototype |
| Design consistency | One implementation of NOVA's components | Two implementations to keep identical by hand |
| Platform feel | Native stack, native modals, system pickers, `VideoView`; gestures and animation on the UI thread (RNGH, Reanimated) | Best possible |
| Codec reach and seek precision | Set by the engine module, not the UI layer. Same as B. | Same as A |
| Native code needed | Engine modules, video surface, media session, PiP glue | Everything |
| Maintenance | One UI codebase, plus two engine modules | Three UI codebases (Windows, iOS, Android) |
| Risk | RN rendering of the timeline or player may fall short of the quality bar. Mitigation: the player surface can become a native view component without rewriting the app. | Cost and drift between platforms |

**Chosen: A.**

- Expo's [Modules API](https://docs.expo.dev/modules/overview/) lets each engine live in Swift or Kotlin behind one TS contract, so nothing playback-critical runs in JavaScript.
- Revisit at M3: if real-device review shows the RN player surface is not good enough, move the player screen (only) to a native view.

## Decision 2 — engines: system engine plus libmpv, behind one contract (pending M2 data)

Candidates per platform:

| | iOS: AVPlayer (AVFoundation) | iOS: libmpv (e.g. MPVKit) | Android: Media3 ExoPlayer | Android: libmpv (as in mpv-android) |
|---|---|---|---|---|
| Containers | MP4/MOV/M4V, HLS. **No MKV/WebM/AVI.** | Everything FFmpeg demuxes | MP4, MKV, WebM, TS, FLV, OGG… | Everything FFmpeg demuxes |
| Video codecs | H.264, HEVC (incl. 10-bit, Dolby Vision), ProRes on supported devices, AV1 on A17 Pro/M3+ hardware | All FFmpeg decoders; hardware through VideoToolbox | Whatever MediaCodec offers per device, plus FFmpeg extension for audio | All FFmpeg decoders; hardware through MediaCodec |
| Audio | AAC, ALAC, AC-3/E-AC-3 (incl. Atmos), FLAC, Opus. **No DTS, no TrueHD.** | Everything, including DTS/TrueHD (decoded to PCM) | Device-dependent; DTS/TrueHD usually missing | Everything |
| Subtitles | WebVTT, tx3g/mov_text, CEA-608. **No ASS styling, no PGS.** | SRT, ASS/SSA with styling, PGS, VobSub | SRT, SSA (basic), WebVTT, TTML, PGS (recent) | Full libass |
| Exact seek | `seek(to:toleranceBefore:.zero, toleranceAfter:.zero)` with a completion handler | `seek … absolute+exact`, measured on desktop (seeking.md) | `SeekParameters.EXACT` | Same as desktop |
| HDR output | Native (HDR10, HLG, Dolby Vision) | Hard. Needs gpu-next with Metal/MoltenVK, and EDR is unproven | Native where the device supports it | Limited and device-dependent |
| PiP, AirPlay, lock screen, background audio | Native | PiP needs a sample-buffer layer bridge; **unproven** | Native (MediaSession) | Must be built by hand |
| Battery and heat | Best (hardware path) | Fine with hardware decoding; worse in software | Best | Fine with hardware decoding |
| Licence | System framework | LGPL build required (see below) | Apache-2.0 | LGPL build required |
| Available in Expo Go | **Yes** (`expo-video`) | No | **Yes** (`expo-video`) | No |

**Proposed:** two engines per platform behind `Capabilities` and `Commands` (`apps/mobile/src/playback/types.ts`, mirroring `nova-playback-api`).

- **System engine by default** for files it can play fully: hardware path, HDR, PiP, AirPlay, battery.
- **libmpv** for files the system engine cannot play: MKV/WebM on iOS, DTS/TrueHD, ASS/PGS, professional codecs.
- **Routing** comes from a probe (container plus streams) before opening. The user can override per file.
- **Consistency rule:** a control that only one engine supports is shown everywhere and explained where it is unavailable, never silently hidden. Format claims in the UI are per engine and per platform (see [platform-matrix.md](../compat/platform-matrix.md)).

**What could change this:** if M2 shows libmpv matching the system engine on HDR, PiP and battery for the corpus, a single-engine design is simpler and must be reconsidered.

## Licensing per platform

- **Windows:** unchanged (ADR 0003). The 0.1.0/0.2.0 installers are GPL. Option B (LGPL build) is still the plan.
- **iOS, App Store:** **GPL binaries are not shippable** in practice: the App Store terms conflict with GPL distribution (the VLC precedent).
  - Any libmpv/FFmpeg for iOS must be an LGPL configuration built from source: mpv `-Dgpl=false`, FFmpeg without `--enable-gpl` or `--enable-nonfree`.
  - It must ship as **dynamic frameworks**, so users can relink, with source, build recipe and notices provided.
  - Whether LGPL compliance is achievable in App Store distribution is debated. **Counsel must sign off before submission.**
- **Android, Google Play:** an LGPL `libmpv.so` is workable (dynamic linking, replaceable `.so` in the APK, source and notices). No GPL.
- **Codec patents.**
  - The system engines use OS-licensed decoders.
  - Shipping FFmpeg *software* decoders for HEVC, H.264, AAC, AC-3 and others in a store app is a separate patent question per jurisdiction. Prefer hardware or system decoders for those codecs where possible, and have counsel decide whether to disable software decoders for patent-encumbered formats.
  - Proprietary camera RAW SDKs (BRAW, R3D) are not redistributable without their own agreements. They stay "detected and explained".
- **Expo/React Native and dependencies** are MIT, Apache-2.0 or BSD. Archivo is OFL-1.1 (no Reserved Font Name; static instances are allowed). An automated licence report per build is required (M5).

## Distribution and updates

- No self-updater on mobile. Updates come through the App Store and Play only.
- EAS Update (over-the-air JS) is permitted for JS and asset fixes within store rules. NOVA will not use it to change native behaviour or the app's purpose. If OTA is used it must be **signed** (code signing) and disclosed on the privacy page, or else it stays off.
- Network use: none in the app by default. The desktop's GitHub update check has no mobile equivalent.
- Privacy labels: "Data Not Collected" is achievable if this stays true.

## Consequences

- `apps/mobile` is an Expo app outside the pnpm workspace (own npm lockfile), so the desktop build is untouched.
- Shared logic lives as pure TS in `apps/mobile/src/core` today, duplicated from desktop for the seek policy. M4 extracts a shared package (or UniFFI bindings to the Rust crates where Rust brings real value: identity hashing, resume and queue rules).
- iOS development builds with native modules need either a Mac with Xcode (a free Apple ID allows 7-day device installs) or EAS Build with a **paid** Apple Developer account. Expo Go needs neither.

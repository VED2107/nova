# Releasing NOVA for Android and iOS

## What a mobile release contains (0.1.0)

| Platform | Artefact | How users get it |
|---|---|---|
| Android 7+ (arm64, armv7) | `NOVA-<version>-android.apk`, signed with the NOVA release key, with a `.sha256` file | GitHub release; sideload (allow "Install unknown apps" for the browser or Files) |
| iOS | **No binary.** An installable iOS app needs Apple signing: a paid Apple Developer membership (TestFlight/App Store) or a Mac with Xcode (7-day personal installs) | Expo Go and a QR code from a developer machine (`npm run mobile`). Same app, same SDK (57) |

**Engine.** Both platforms play through the phone's own decoders: AVPlayer on iOS, Media3 ExoPlayer on Android, via `expo-video`. NOVA's libmpv engine is **not** in this release (ADR 0007, milestone M2b), so:

- MKV/WebM on iPhone, DTS and TrueHD audio, and styled or image subtitles depend on what the phone supports.
- Subtitle delay and size, Deinterlace and Save frame are shown as unavailable, with the reason.

## Licences in the APK

The APK contains no GPL or LGPL code. There is no libmpv and no FFmpeg; the system decoders are part of Android.

- **NOVA's own code:** MIT OR Apache-2.0.
- **Bundled JS and native libraries:** React Native, Expo modules, Reanimated, Gesture Handler, Screens, SVG and AsyncStorage are under MIT, Apache-2.0 or BSD. The generated list is `apps/mobile/THIRD-PARTY-NOTICES.md`. It is attached to every release, and the in-app About section points to it.
- **Font:** Archivo is under the SIL OFL 1.1 (`apps/mobile/assets/fonts/OFL.txt`).

## Privacy

NOVA makes no network requests. The `INTERNET` permission that React Native declares is unused by NOVA.

The APK asks for no storage or media permission. Files come only through the system picker or a folder the user grants (SAF). The permissions it does not use are removed in `app.json`: storage, media, microphone, overlay and write-settings.

## Build (Android)

```bash
bash scripts/build-android-release.sh      # → target/mobile/NOVA-<version>-android.apk (+ .sha256)
```

Requirements:

- **Android SDK:** `%LOCALAPPDATA%\Android\Sdk`.
- **JDK 17–21:** Android Studio's `jbr` works; JDK 24 is too new for this Gradle.
- **The release key:** `~/.nova/android/nova-release.jks`, with credentials in `~/.nova/android/keystore.properties`.

**Back up `~/.nova/android/`.** Android installs an update only if it is signed with the same key. The SHA-256 certificate fingerprint of the key is published in each release's notes.

Do not run the build while a Metro dev server is running: `npm ci` cannot replace files that Metro has open on Windows.

## Release gate (mobile)

| Check | 0.1.0 |
|---|---|
| `npm run check`, `npm test`, `expo-doctor` | Pass |
| JS bundles for iOS and Android build (`expo export`) | Pass |
| Signed APK builds; manifest permissions reviewed | Pass |
| Licence list generated from the installed dependency tree | Pass |
| Owner ran the app on an iPhone through Expo Go | Yes (2026-10-18, before the feature-parity update) |
| APK installed and run on a real Android device | **Not done on this machine.** First install is the owner's check |
| Accessibility pass (VoiceOver, TalkBack, large text) | **Not done** |

Because of the two open checks, the GitHub release is marked **pre-release**.

## Updates

- **Android:** download the newer APK and install it over the old one, which works because the signing key is the same.
- **No self-updater on mobile:** the desktop updater model (signed `latest.json`) is not used; store builds update through the stores.

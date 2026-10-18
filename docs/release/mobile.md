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

**Usual path: GitHub Actions** (`.github/workflows/mobile-android.yml`).

- **What triggers it:** pushing a tag `mobile-vX.Y.Z` runs the checks, builds the signed APK on a GitHub runner, verifies the signature, and attaches the APK, its `.sha256` and the notices to the GitHub release with that tag.
- **Signing:** the key comes from the encrypted repository secrets `NOVA_ANDROID_KEYSTORE_B64` and `NOVA_ANDROID_STORE_PASSWORD`. The runner deletes it after the build.

```bash
git tag mobile-v0.1.0 && git push origin mobile-v0.1.0
gh release create mobile-v0.1.0 --prerelease --title "NOVA mobile 0.1.0" --notes-file <notes>
```

**Local build** (same script; on a slow connection the first Gradle run downloads about 1 GB of dependencies):

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

| Check | 0.1.0 / 0.2.0 |
|---|---|
| `npm run check`, `npm test`, `expo-doctor` | Pass |
| JS bundles for iOS and Android build (`expo export`) | Pass |
| Manifest permissions reviewed | Pass |
| Signed APK builds, signature verified (CI, `apksigner verify`) | See the release's workflow run |
| Licence list generated from the installed dependency tree | Pass |
| Owner ran the app on an iPhone through Expo Go | Yes (2026-10-18, before the feature-parity update) |
| APK installed and run on a real Android device | **Not done on this machine.** First install is the owner's check |
| Accessibility pass (VoiceOver, TalkBack, large text) | **Not done** |

Because of the two open checks, the GitHub release is marked **pre-release**.

## Updates

- **Android (from 0.2.0): in-app updates** (`apps/mobile/src/core/updates.ts`).
  - At start-up (setting "Check for updates automatically", on by default) the app asks `api.github.com/repos/VED2107/nova/releases` for the newest `mobile-vX.Y.Z` release that carries `NOVA-X.Y.Z-android.apk`. Desktop tags (`v*`) and drafts are ignored; a tag without its APK attached yet is skipped.
  - **Install** downloads the APK into the app cache, checks it against the release's `.sha256` and opens Android's package installer (`REQUEST_INSTALL_PACKAGES`). Android accepts it only if it is signed with the same key, which is the real guarantee: a swapped APK with a swapped checksum is still refused.
  - So a release must attach both `NOVA-X.Y.Z-android.apk` and `NOVA-X.Y.Z-android.apk.sha256` (the workflow does), and `app.json` must raise `version` and `android.versionCode`.
  - 0.1.0 has no updater: users install 0.2.0 by hand once.
  - A Google Play build must not ship this updater (Play forbids self-updates outside Play); remove it there.
- **iPhone:** Expo Go loads the newest JavaScript from the dev server when opened; there is no iOS binary to update.

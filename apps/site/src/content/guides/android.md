---
title: NOVA for Android
summary: Installing the APK, what the Android app does, in-app updates, Open with NOVA, and what still needs NOVA's own engine.
order: 6
status: incomplete
statusNote: Written for Android 0.2.0. The APK is built and signed in CI and the app was exercised in Expo Go on a phone; the release APK itself has not yet been tested on a device.
---

## Installing

1. Download the APK from [Release](/release#android) and compare its SHA-256 with the one listed there.
2. Open the file. NOVA is not on Google Play, so Android asks you to allow **Install unknown apps** for your browser or Files app the first time.
3. Every NOVA APK is signed with the same certificate (its SHA-256 fingerprint is on the Release page). Android installs an update over NOVA only if it carries that certificate, so your library, positions and settings stay.

Android 7.0 or newer, on arm64 or armv7 phones and tablets.

## Updates

From 0.2.0 NOVA updates itself, as the Windows app does:

- At start-up it asks GitHub whether a newer NOVA for Android exists. Nothing else is sent.
- When one does, Home shows **NOVA x.y.z is ready**. **Install** downloads the APK, checks it against the release's SHA-256 and opens Android's installer; **Later** hides the notice until the next start.
- Turn the check off, or check by hand, in **Settings → Updates**.

0.1.0 has no updater: install 0.2.0 from the Release page once.

## What it does

The same Home, Library and player as on Windows, for touch:

- **Home**: Continue, your folders, Recently added, Playlists.
- **Library**: add whole folders (Android keeps access until you remove them) or single files; search, sort, grid or list, poster frames, a missing-files filter.
- **Open with NOVA**: from a file manager or another app, choose NOVA to play a video or audio file.
- **Player**: the desktop control bar with speed, audio, subtitle and A–B readouts; the **…** menu has desktop's Playback, Audio, Subtitles, Video, View, Playlist and Tools groups.
- **Seeking**: exact, with preview frames while you drag; slide your finger up while dragging for fine control; double-tap a side to skip.
- **Tools**: speed 0.25–4×, A–B loop, frame step, go to time, aspect ratio and zoom, rotation, save frame, picture in picture, lock, queue with repeat and shuffle, playlists, resume with Start over.
- **Gestures**: swipe on the right for volume and on the left for brightness, pinch to fill.
- **Background playback** (Settings, off by default): sound keeps playing with the screen off, with play, pause and skip in the notification and on headphones.

**Save frame** writes the exact frame, at full size, as a PNG into a folder you pick the first time (Pictures, say). No storage permission is involved.

## What needs NOVA's own engine

The Android app plays through the phone's own decoders (Media3). What plays therefore depends on the phone. Not available yet, and marked as such in the app:

- DTS and TrueHD audio, image subtitles (PGS) and styled ASS subtitles.
- Audio and subtitle delay, subtitle size (Android uses the system caption style) and external subtitle files.
- Chapters, deinterlacing and decoder diagnostics.

These come with NOVA's own engine (libmpv, LGPL) on Android, which is not built yet. The APK contains no GPL or LGPL code.

## Privacy

No account and no analytics. Files stay on the phone; NOVA keeps titles, positions and settings locally. The only network request is the update check, which you can turn off. NOVA asks for no storage, media or microphone permission. The permissions it does request are for installing its own updates and, when you turn it on, background playback.

## iPhone

There is no iPhone download. Installing an app on iPhone needs Apple signing; until then NOVA runs on iPhone only in Expo Go, as a development preview.

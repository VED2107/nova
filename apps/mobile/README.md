# NOVA for Android and iOS

This is the NOVA iOS and Android app. Today it is a **design and interaction prototype** that runs in **Expo Go**.

- **Real playback:** files are decoded by the phone's own player, AVPlayer on iOS and Media3 on Android, through `expo-video`.
- **What it does not include yet:** NOVA's own libmpv engine. Formats the phone can't open show an explained error instead.

See [ADR 0007](../../docs/adr/0007-mobile-architecture.md) and [mobile.md](../../docs/architecture/mobile.md).

## See it on your iPhone (no Apple Developer account)

You need:

- **Node.js 20+** on this computer.
- **Expo Go** from the App Store on the iPhone. Expo Go must support **SDK 57**, the SDK of the App Store Expo Go on 2026-10-18 (version 57.0.9). This project is pinned to SDK 57 for that reason; do not upgrade it until the App Store Expo Go supports a newer SDK. Check with `curl -s https://api.expo.dev/v2/versions/latest` (field `expoGoSdkVersion`).

```bash
cd apps/mobile
npm install          # first time only
npm start            # = expo start --lan
```

1. A QR code appears in the terminal.
2. Open the iPhone **Camera** app and point it at the QR code. Tap the banner; it opens Expo Go. (On Android, scan from inside Expo Go.)
3. The first load bundles the app, which takes 10–30 s. After that, saving a file updates the phone instantly (Fast Refresh).
4. If something gets stuck, press `r` in the terminal to reload, or `shift+m` for more tools.

**Phone and computer must be on the same Wi-Fi.** If the phone can't connect:

- **Allow Node through Windows Firewall.** Accept the prompt the first time, or allow "Node.js" on *Private* networks.
- **Network blocks device-to-device traffic** (guest, hotel or office Wi-Fi), or the networks differ: use the tunnel:
  ```bash
  npm run tunnel     # = expo start --tunnel (installs @expo/ngrok on first use)
  ```
- **VPN on either device:** turn it off, or use the tunnel.

## What's in the app

The same structure as the Windows app, adapted to touch:

- **Home:**
  - **Continue** shows the title in progress with its number, its progress and Resume.
  - **Your shelf** lists your folders, with Add folder.
  - **Recently added** is a poster grid. **Playlists** lists your saved playlists.
- **Library:**
  - folders (as chips) and playlists
  - search, sorting by A–Z, Newest or Recent, and a **Missing files** filter
  - grid or list view, with poster frames
  - an item menu (long press or **…**): Play, Play next, Add to queue, Add to playlist, Start over, Remove, Details
- **Player:**
  - **The desktop deck:** a cream play key, Stop, Previous and Next, a volume bar, and the SPEED / AUDIO / SUBTITLES / A–B readouts, plus Queue, Info, Subtitles and the **…** menu.
  - **The … menu** is grouped like the desktop right-click menu: Playback, Audio, Subtitles, Video, View, Playlist and Tools.
  - **The timeline** has exact landing, preview frames, ½–⅛ fine scrubbing (slide your finger up) and an A–B bracket.
  - **Playback tools:** a queue with repeat (off, all or one) and shuffle, go to time, frame step, aspect (fit, fill or stretch), rotate, lock, PiP and screen rotation.
  - **Gestures:** double-tap to skip, swipe for volume (right side) and brightness (left side), pinch to fill.
- **Settings:** seeking, gestures, theme, haptics, history and folders, privacy, and a table of what works where.

Start with the **Test card**. Every frame shows its frame number, so you can check that a seek lands where the timeline says.

## Get it

- **Android:** install `NOVA-<version>-android.apk` from the GitHub release. You will need to allow "Install unknown apps" for your browser or Files app.
- **iPhone:** Expo Go and a QR code, as above. An installable iPhone app needs Apple signing; see `docs/release/mobile.md`.

## What works where

| | Expo Go / Android APK (system engine) | With the NOVA engine (planned dev build) |
|---|---|---|
| Library, folders, playlists, queue, history, settings, themes, gestures | Yes | Yes |
| MP4/MOV with H.264 and HEVC; exact seeking; preview frames; embedded tracks; A–B loop; frame step; PiP | Yes | Yes |
| MKV/WebM (Android: yes; iPhone: no), DTS/TrueHD, ASS/PGS subtitles, subtitle delay and size, deinterlace, save frame | Depends on the phone | Yes, with the libmpv module (not built yet) |
| Background audio, lock-screen controls | No | Planned |

## Checks

```bash
npm run check   # TypeScript
npm test        # seek policy and time formatting (node --test)
npm run doctor  # expo-doctor
```

`apps/mobile` uses npm and is deliberately not part of the pnpm workspace.

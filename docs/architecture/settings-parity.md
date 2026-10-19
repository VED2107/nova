# Settings parity: Windows → Android → iOS

Owner's direction (2026-10-19): Windows and Android are the products; Android should have the same settings and functions as Windows. iOS runs the same app through Expo Go with the phone's player and is secondary.

The phone's Settings screen mirrors the Windows dialog: the same seven sections in the same order (Keys & mouse becomes **Touch & gestures**), the same labels and wording, a section bar in place of the sidebar, search, and "Changes save as you make them".

**Engines.** Windows: libmpv. **Android app: libmpv** (`modules/nova-mpv`, same options as desktop, MediaCodec for hardware decoding), with the phone's Media3 player as a per-app choice and a per-file fallback. **iOS / Expo Go:** the phone's player (AVPlayer, or Media3 in Expo Go on Android); libmpv cannot load in Expo Go.

| Windows setting (key) | Android app | iOS / Expo Go | Mobile control | Platform limit | Verified by |
|---|---|---|---|---|---|
| Theme: System / Daylight / Night (`theme`) | Yes | Yes | Segmented, Appearance | — | Rendered (web preview 390 × 844) |
| Control bar: Full / Compact (`timelineLayout`) | Yes (`controlBar`) | Yes | Segmented + player menu › View | Touch layout, not a copy of desktop | Rendered: compact row on test card |
| Hide controls while playing (`autoHide`) | Yes, plus **Hide after** 2/3/5/8 s | Yes | Switch + segmented | Desktop fixed 2.5 s | Code path `poke()` |
| Hardware decoding (`hwdec`) | **Yes**: switch, MediaCodec ↔ software, decoder shown in Info | Explained (system player is always hardware) | Switch, Playback | — | Emulator run (see mobile.md) |
| Resume where you left off (`resume`) | Yes | Yes | Switch | — | Existing library tests |
| While dragging the timeline (`scrub`) | Yes | Yes | Segmented | — | `seek.test.ts` |
| Time display (`timeDisplay`) | Yes | Yes | Segmented; tap the time in the player | — | — |
| Subtitle size 50–300 % (`subScale`) | **Yes**, same steps, saved, applied to every file | Explained: system caption style | − % + Reset; player menu | — | — |
| Subtitle / audio delay (per file, 50 ms) | **Yes**, player menu, reset per file as on desktop | No (expo-video has no delay API) | Player menu › Audio / Subtitles | — | — |
| Add subtitle file | **Yes** (any file via the picker; SRT, ASS, VTT, PGS…) | No | Player menu; Audio & subtitles sheet | — | — |
| Wheel over the picture (`wheel`) | Swipe right side = volume, left = brightness, sensitivity Low/Normal/High | Same | Switch + segmented | No wheel on phones | — |
| Ctrl + wheel (`ctrlWheel`) | Subtitle size buttons in the menu | — | — | No modifier keys | — |
| Click on the picture (`click`) | **Tap on the picture**: Show controls / Play-pause | Same | Segmented | — | — |
| Double-click (`dblclick` → fullscreen) | Double-tap to skip | Same | Switch | Player is always fullscreen | — |
| Keyboard shortcuts (`keymap`) | Explained | Explained | Row | Hardware keyboards not handled yet | — |
| Check for updates automatically (`updates`) | Yes (GitHub, signed APK) | Not applicable (no iOS binary) | Switch, About | Store builds must remove it | Existing `version.test.ts` |
| Watch history: Clear | Yes | Yes | Button | — | — |
| Library folders | Yes (SAF tree) | Session only | List with Remove | iOS folder access ends with the app | — |
| Formats | Matrix per engine | Matrix | Table | — | — |
| About: version, engine, licences | Yes | Yes | Text | — | — |
| *Mobile only:* Skip amount, Orientation, Haptics, Background playback, Audio language, Subtitles when a title opens, Playback engine | — | — | — | — | `tracks.test.ts` (language choice) |

## Player functions (right-click menu → More sheet)

Same groups as the desktop context menu: Playback, Audio, Subtitles, Video, View, Playlist, Tools. On the libmpv engine these are real on Android: chapters, exact frame step (`frame-step`), subtitle and audio delay, subtitle size, add subtitle file, hardware decoding, aspect/rotation/zoom done by the engine, seek landing reported by the engine. Not available on Android libmpv: **Deinterlace** (the AAR is built without FFmpeg filters) and **picture in picture** (use the phone's player). Save frame uses Android PixelCopy of the shown picture.

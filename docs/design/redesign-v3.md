# NOVA redesign v3 — audit, direction, verification (0.2.0)

Branch `redesign/v3` from `main` at `c6b1992` (0.1.0). Released as 0.2.0.

## 1. Audit of 0.1.0 (captured from the released build)

| Area | Problem |
| --- | --- |
| Right-click menu | One 40-row scrolling list (Playback, Speed, Audio, Subtitles, Video, View); nothing grouped into submenus; ran off the bottom of the window. |
| Control bar | Gradient scrim over the picture; thin timeline; A–B, speed and tracks at equal weight; no compact mode. |
| Timeline | No previews, no chapters, A–B drawn as a faint tint. |
| Subtitles | No size control at all; Ctrl + wheel did nothing (and could zoom the WebView). |
| Header (player) | Back button, title and spec loosely arranged. |
| Library / Home | No sign of which title is loaded in the player. |
| WebView | Right-click outside the player showed the browser's own menu (Back, Reload, Inspect). |
| Updates | None: every release had to be downloaded by hand. |

## 2. Direction

Chosen through the impeccable direction round (seed `39d38cc7`): **Reference monitor**. The player is a calibrated
monitor; ember is the tally lamp ("live"); every state is an engraved label plus a readout of the engine's value.
Identity kept: Lumen N, Archivo, cream / ink / ember / grey, the beam playhead. Raises from the declined directions:
timeline state as line form (chapter cuts, A–B bracket, dashed hover ghost), one depth rule for menus, the queue as a
line of stations, an ember budget of about four per screen. Contract: `apps/desktop/.impeccable/surfaces/src-app-app-tsx.md`.

User decisions during the build: the control bar has a **Full** and a **Compact** mode (Compact is a small bar centred
at the bottom, like VLC), switchable from the bar itself; header and bar are **translucent** (the picture is a native
layer under the WebView, so a real backdrop blur is impossible; translucent ink with text shadows is used instead).

## 3. What changed

- **OSD menu ladder** (`components/OsdMenu.tsx`, `features/player/playerMenu.ts`): right-click, Menu key or Shift+F10.
  Top level: Play/Pause · Playback · Audio · Subtitles · Video · View · Playlist · Tools · Open file · Back to library.
  Hover intent (90 ms), pointer corridor toward an open submenu, flips at window edges, keyboard Up/Down/Left/Right/
  Enter/Esc/Home/End and type-ahead, checkbox/radio semantics, disabled rows carry a reason. Steppers (delays, size,
  volume) keep the menu open. The deck's readout keys open the same submenus; a second click on a key closes it.
- **Control bar** (`ControlBar.tsx`): Full = timeline row (elapsed · bar · length) above transport, level, readout
  keys (Speed, Audio, Subtitles, A–B), queue, details, bar-size toggle, menu, fullscreen. Compact = one floating bar,
  `min(760px, 100%)` wide, centred at the bottom. Toggle: bar button, `C`, View menu, Settings → Appearance.
- **Timeline** (`Timeline.tsx`): slim track that thickens on intent, beam playhead, chapter cuts, A–B bracket,
  dashed hover ghost, frame preview with timestamp and chapter name.
- **Engine** (`nova-playback-api`, `nova-playback-mpv`): `SetSubtitleScale` / `adjust.subtitleScalePercent`;
  `chapters` in the snapshot; `preview_frame` Tauri command (isolated libmpv, software decode, 320 px, one at a time).
- **Subtitle size**: Ctrl + wheel over the picture (configurable: subtitle size / volume / nothing), Alt+↑/↓/0, menu,
  Settings stepper; saved as `subScale` and re-applied at start-up. OSD shows the engine-confirmed value.
- **OSD readouts** for volume, subtitle size, delays, speed, aspect, rotation, deinterlace, A–B, track changes —
  driven by snapshot changes, never by the request.
- **Chapters**: Shift+N / Shift+P (VLC defaults; queue keeps N / P and the media keys).
- **Header**: back button, title, tally lamp + state, spec line (opens Playback details).
- **Queue** as a line of stations; **On air** mark in Home and Library; header now-playing button with tally.
- **Settings**: Audio & subtitles section; Ctrl + wheel option; Control bar option; About → Updates.
- **Browser chrome suppressed**: no WebView context menu (text fields keep Cut/Copy/Paste), no reload / print /
  zoom keys, no Ctrl + wheel page zoom.
- **Updates**: Tauri updater against `releases/latest/download/latest.json` on GitHub, minisign-verified with the
  public key in `tauri.conf.json`; checked 8 s after start-up unless turned off; installs on request and restarts.
- **Installer identity**: NSIS sidebar and header artwork drawn from the Lumen N geometry (`src-tauri/installer/`),
  publisher, description, copyright.

## 4. Verification

| Check | Result |
| --- | --- |
| Rust tests (workspace) | pass — playback-api 35 (new: chapters per session, scale player-wide, scale validation), mpv 3 (new: chapter parsing), storage 28 (new prefs) |
| Vitest | 44/44 (new: subtitle size steps and keys, chapter targets, default keymap has no conflicts) |
| `tsc`, clippy `-D warnings`, rustfmt | clean |
| impeccable detector | no findings |
| Contrast (computed, worst case: white footage under the glass) | bottom-row labels ≈5.5:1, timeline row ≈4.6:1, header title > 7:1 |

**Inspected in the running app** (debug build, isolated profile, driven only through the WebView's DevTools
protocol — no OS input — and captured with PrintWindow): Home (Night, Daylight), Library grid/list and item menu,
player playing and paused, right-click ladder with Subtitles and Playback → Speed submenus, deck subtitle key menu
(second click closes it), Ctrl + wheel subtitle size with OSD, subtitles rendering above the deck at 120 %, timeline
preview frames with chapter name, A–B bracket, queue stations, playback details, end-of-title auto-advance, Settings
(Audio & subtitles, Keys & mouse, Appearance, About → Updates "up to date"), shortcuts, Full and Compact bars at
1440×900 and 860×600, On-air marks, Escape closing Settings.

Before / after: `v3/*-before.jpg`, `v3/*-after.jpg` (synthetic test-pattern media from `tests/fixtures`).

## 5. Not verified / known issues

- Installer artwork and the in-app update flow end to end (download → verify → install → restart) are exercised for
  the first time by 0.2.0 → the next release; 0.1.0 has no updater.
- Not inspected: 125 % / 150 % Windows scaling, real fullscreen interaction, very long titles in the compact bar,
  HDR / 4K preview-frame speed, screen readers.
- Once during an automated run the window went fullscreen before a Settings capture; not reproduced in three direct
  attempts.
- The impeccable finish review and DESIGN.md were not run: the release was requested before that step.

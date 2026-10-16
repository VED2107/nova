---
title: Playing media
summary: The control bar in Full and Compact sizes, the right-click menu, the timeline, subtitles, speed, loops, frames and fullscreen.
order: 2
status: current
statusNote: Written for 0.2.0. Verified in the running app on one machine with synthetic test files; see docs/design/redesign-v3.md.
---

## The control bar

The controls come in two sizes. Switch with the bar's own button (next to the menu button), the <kbd>C</kbd> key, **View → Compact control bar** in the right-click menu, or **Settings → Appearance → Control bar**.

- **Full**: the timeline runs across the player, with elapsed time on the left and the length on the right (click it to show time remaining). Below it: play/pause, stop, previous and next, volume, then readout keys that show what the engine is doing — **Speed**, **Audio**, **Subtitles**, **A–B** — then the queue, playback details, bar size, the menu and fullscreen.
- **Compact**: one small bar centred at the bottom of the picture, like VLC's: play/pause, stop, a short timeline, volume, subtitles, bar size, the menu and fullscreen. Everything else is one right-click away.

The header and the bar are translucent so the picture shows through. They fade after 2.5 seconds without mouse movement (switch this off in **Settings → Appearance**) and come back when you move the mouse or press a key. Subtitles rise above the bar while it is visible.

The header shows a small tally lamp — solid ember while playing, an outline while paused — the title, and what the engine is decoding. Click that line for playback details.

## The right-click menu

Right-click the picture (or press the <kbd>Menu</kbd> key or <kbd>Shift</kbd> <kbd>F10</kbd>) for every player tool, grouped in submenus: **Playback**, **Audio**, **Subtitles**, **Video**, **View**, **Playlist** and **Tools**, with **Open file** and **Back to library** below. Each row shows its current value and its key. Items that can't be used say why, for example "This file has no chapters".

Submenus open as you hover, and stay open while you move toward them. With the keyboard: arrows move, <kbd>→</kbd> or <kbd>Enter</kbd> opens a submenu, <kbd>←</kbd> closes it, <kbd>Esc</kbd> closes the menu, and typing a letter jumps to it. Clicking a readout key on the bar opens the matching submenu; clicking it again closes it.

## The timeline

Hover the timeline to see a frame from that moment with its time and, when the file has chapters, the chapter's name. The frames are decoded by NOVA's engine as you hover; audio files show the time only. Chapters appear as small cuts in the line, and an A–B loop as a bracket around the looped part. The playhead is the beam from NOVA's N; drag it, click anywhere on the line, or use the keys below.

## Seeking

| Move | Keys |
| --- | --- |
| 5 seconds | <kbd>←</kbd> <kbd>→</kbd> |
| 30 seconds | <kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| 1 minute | <kbd>Ctrl</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| 1 second | <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| One frame | <kbd>.</kbd> or <kbd>E</kbd> forward, <kbd>,</kbd> back |
| A time you type | <kbd>Ctrl</kbd> <kbd>T</kbd> |
| Next / previous chapter | <kbd>Shift</kbd> <kbd>N</kbd> / <kbd>Shift</kbd> <kbd>P</kbd> |

Every binding can be changed; the full list is on [Keyboard shortcuts](/docs/shortcuts).

## Subtitles and audio

- **Size**: hold <kbd>Ctrl</kbd> and turn the mouse wheel over the picture, or press <kbd>Alt</kbd> <kbd>↑</kbd> / <kbd>Alt</kbd> <kbd>↓</kbd> (<kbd>Alt</kbd> <kbd>0</kbd> resets). A readout shows the size, from 50 % to 300 %, and NOVA remembers it. In **Settings → Keys & mouse** Ctrl + wheel can change the volume instead, or nothing.
- **Tracks**: the **Subtitles** and **Audio** submenus, or <kbd>V</kbd> and <kbd>B</kbd> to step through them. Add a subtitle file with <kbd>Shift</kbd> <kbd>V</kbd> or by dropping it on the player.
- **Timing**: earlier or later in 50 ms steps — <kbd>G</kbd> / <kbd>H</kbd> for subtitles, <kbd>J</kbd> / <kbd>K</kbd> for audio, with resets on <kbd>Shift</kbd> <kbd>H</kbd> and <kbd>Shift</kbd> <kbd>K</kbd>. The menu keeps itself open while you step, and a readout shows the delay.

**Video** in the menu holds aspect ratio, rotation, deinterlacing, saving the current frame and the decoder in use.

## Speed and loops

- <kbd>]</kbd> faster, <kbd>[</kbd> slower, <kbd>=</kbd> normal. Speed runs from 0.25× to 4×.
- <kbd>L</kbd> sets the loop start, then the end, then clears it.
- <kbd>Shift</kbd> <kbd>L</kbd> cycles repeat: off, one, all.

## Saving a frame

<kbd>Shift</kbd> <kbd>S</kbd> saves the current frame as a PNG in `Pictures\NOVA`. The confirmation offers **Show in folder**.

## Playback details

Press <kbd>I</kbd> for the details panel: container, size and bitrate, codec, resolution, frame rate, bit depth, chroma, alpha, dynamic range, the decoder in use (hardware or software) and the sound format. Everything in it is reported by the engine, not guessed from the file name.

## When a file ends

An **End of title** card offers Play next, Play again or Back to library. With repeat on, the queue continues instead.

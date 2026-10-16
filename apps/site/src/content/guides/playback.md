---
title: Playing media
summary: The deck, the More menu, tracks and subtitles, speed, A–B loop, frames and fullscreen.
order: 2
status: current
statusNote: Written from 0.1.0-rc.1. Statuses come from the RC1 test record.
---

## The deck

One control deck sits under the picture: the timeline on top, then previous, play/pause, next, time and volume on the left. On the right are the A–B loop, speed and subtitles, which turn ember only when they are not at their default, then the queue, playback details, **More** and fullscreen.

The playhead is the beam from NOVA's N. Hover the timeline to see the time under the pointer; drag the playhead or use the arrow keys to seek.

Controls fade after 2.5 seconds without mouse movement (switch this off in **Settings → Appearance**). Subtitles rise above the deck while it is visible.

## Seeking

| Move | Keys |
| --- | --- |
| 5 seconds | <kbd>←</kbd> <kbd>→</kbd> |
| 30 seconds | <kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| 1 minute | <kbd>Ctrl</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| 1 second | <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd> |
| One frame | <kbd>.</kbd> or <kbd>E</kbd> forward, <kbd>,</kbd> back |
| A time you type | <kbd>Ctrl</kbd> <kbd>T</kbd> |

Every binding can be changed; the full list is on [Keyboard shortcuts](/docs/shortcuts).

## The More menu

**More** holds every tool for picture, sound, subtitles and frames, each with its key: go to time, frame step, save the current frame, audio and subtitle tracks, audio and subtitle delay in 50 ms steps, adding a subtitle file, aspect ratio, rotation and deinterlacing.

Track menus are verified. Loading an external subtitle file was verified in an earlier pass and not re-run for RC1.

## Speed and loops

- <kbd>]</kbd> faster, <kbd>[</kbd> slower, <kbd>=</kbd> normal. Speed runs from 0.25× to 4×.
- <kbd>L</kbd> sets the loop start, then the end, then clears it.
- <kbd>Shift</kbd> <kbd>L</kbd> cycles repeat: off, one, all.

## Saving a frame

<kbd>Shift</kbd> <kbd>S</kbd> saves the current frame as a PNG in `Pictures\NOVA`. The confirmation offers **Show in folder**.

## Playback details

Press <kbd>I</kbd> for the details panel: container, size and bitrate, codec, resolution, frame rate, bit depth, chroma, alpha, dynamic range, the decoder in use (hardware or software) and the sound format. Everything in it is reported by the engine, not guessed from the file name.

## When a file ends

A **Finished** card offers Play next, Play again or Back to library. With repeat on, the queue continues instead.

---
title: Troubleshooting
summary: Files that won't play, sound without picture, camera RAW, editing projects, HDR and subtitles.
order: 5
status: incomplete
statusNote: Covers the cases NOVA's own screens and the test record describe. More will follow from real-world reports after release.
---

## “NOVA couldn't play this file”

The file may be damaged, incomplete or not media at all. NOVA names the file and offers to open another, try again or go back to the library.

- Check that the file plays elsewhere.
- If it was downloading or copying, wait for it to finish.
- Open **Technical details** on the error screen for the engine's own message.

## Sound but no picture, or the reverse

One stream uses a codec the engine can't decode. NOVA keeps playing the other stream and shows a banner saying which part is missing. Look the format up in the [Media Atlas](/atlas).

## A camera RAW file

RED R3D, Blackmagic RAW, ARRIRAW and Canon Cinema RAW Light need their makers' decoders, which NOVA does not ship. NOVA recognises these files and explains the alternatives, usually exporting a ProRes or DNxHR file from the camera maker's software. Sony X-OCN looks like ordinary MXF, so it is reported as a video codec that can't be decoded.

## An editing project

Premiere Pro, After Effects, Resolve, Final Cut, Vegas, Kdenlive and similar project files are not media; they describe a timeline. NOVA recognises them and suggests exporting from the editor.

## HDR looks flat or too bright

HDR10 and HLG are detected and reported, but tone mapping to an SDR screen and output on an HDR display have not been checked by eye yet. Compare with another player, and see the [Atlas entries](/atlas?cap=hdr).

## Subtitles behind the controls

A known issue: subtitles drawn by the engine can sit under the deck while it is visible. Moving the pointer away hides the deck.

## Something else

Report it on [GitHub issues](https://github.com/VED2107/nova/issues), with the details from the playback details panel (<kbd>I</kbd>).

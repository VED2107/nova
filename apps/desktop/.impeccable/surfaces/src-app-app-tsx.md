---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: ["src/features/home/HomeView.tsx","src/features/library/LibraryView.tsx","src/features/player/PlayerView.tsx"]
---

# Surface: NOVA desktop app (all screens)

Scope: whole desktop UI — player, context menu, timeline, home, library, queue, inspector, settings, dialogs. Visitor mode: Operate.
Audience/job: viewers first (open, watch, resume, find again); pros one step deeper (verify demanding footage, reach every tool fast).
Constraints: real engine state only (no invented chapters, buffering, frames, metadata); no fake media; WCAG 2.2 AA; transparent WebView over native libmpv video, so no backdrop blur and no effects over the picture beyond opaque plies; identity pinned: Lumen N, Archivo, cream/ink/ember/grey.

## Direction contract
THESIS: The player is a calibrated reference monitor. Picture edge to edge; on intent an engraved control strip rises, ember is the tally lamp that means "live", and every state reads as an engraved label plus a readout value. Refuses the category's gradient scrim, centred giant play button and pill controls.
OWN-WORLD: Monitor = ink ply (#0d0d0c ~94%) with one hairline top rule and one soft shadow, never glass; engraved labels in condensed Archivo caps at 10.5px, readouts in tabular figures. Ember budget: tally, played rule/beam, current item, focus. Paper = machine-room log: cream stock, ink rules, catalogue numbers, spec lines, stamps.
STORY: The viewer presses play and sees only the picture; touches the mouse and the strip reports exactly what the engine is doing; right-clicks and walks a short OSD ladder to any tool; comes home and resumes in one click.
FIRST VIEWPORT: Player: picture full-bleed. Bottom strip: left a timecode block (elapsed large, duration below); right of it the ruled timeline (tick scale, chapters as ticks, A–B as a doubled bracket, beam playhead, frame preview on hover). Under it function keys: transport left; readout keys (SPEED 1.00×, AUDIO EN, SUBS OFF, A–B) centre-right; queue, details, fullscreen right. Top-left tally lamp + state label + title; top-right spec readout.
FORM: Broadcast reference monitor / master-control bezel, #3 of 7 on my ordered list, seed key 39d38cc7. Raises: timeline state as line form — ticks, doubled bracket, dashed hover ghost (emission-line rail); ply as the only depth rule (acetate manual); queue as a line of stations (transit diagram); four-ember accent budget (monochrome canon).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction
The OSD ladder: right-click opens a nine-row menu at the pointer, each row label + live readout + chevron; submenus step out sideways with a forgiving pointer corridor, keyboard Left/Right walks levels. Motion grammar: 120–180ms strong ease-out, transform/opacity only, collapsed under reduced motion.

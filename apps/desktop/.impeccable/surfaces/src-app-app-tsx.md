---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: ["src/features/home/HomeView.tsx","src/features/library/LibraryView.tsx","src/features/player/PlayerView.tsx"]
---

# Surface: NOVA desktop app (all screens)

Scope: whole desktop UI — player, home, library, queue, inspector, settings, dialogs. Visitor mode: Operate.
Audience/job: viewers first (open, watch, resume, find again); pros one step deeper (verify demanding footage).
Constraints: real engine state only; no fake media; WCAG 2.2 AA; transparent WebView over native video; no focus-stealing verification.

## Direction contract
THESIS: NOVA is a collector's shelf that plays. The library is a run of numbered spines, each file a catalogued title with its technical spec printed like a disc back cover; it refuses the category default of a dark poster-grid streaming clone and the cream dashboard of cards.
OWN-WORLD: Daylight = cream stock (#F7F4EE) with ink type and 1px ink seams; Darkroom = ink (#171715) for playback. Ember (#F97316) only marks "now": playhead, current spine, focus, live scan. Tabular figures for every number; spec lines set as "ProRes 422 HQ · 10-bit 4:2:2 · PCM 5.1". Status stamps (In progress / Watched / Missing) stamped, never colored pills. Destructive actions isolated.
STORY: The viewer sees what they were watching, picks it up in one click, finds anything by typing, and trusts the spec line because the engine wrote it.
FIRST VIEWPORT: Home: wordmark top-left, "Continue" as a horizontal shelf of large spine-cards (thumbnail frame, title, catalog no., progress rule in ember), below it the Shelf (recently added rows), right edge stepped tab rail of library folders. Primary action: resume top item; Open file always in the header.
FORM: Home-video collector's spine catalog, #5 of 7 on my ordered list, seed key cead1c49. Raises: tabular mono figures + isolated destructive actions (dev-console); state stamps (ticket wallet); stepped tab rail for library extent (acetate manual).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

---
name: NOVA preview site
description: NOVA's catalogue, projected. Cream and ink paper stock, a darkroom plate for the real app, one ember beam that means "now".
colors:
  ember: "#f97316"
  ember-text: "#a84a08"
  paper: "#f7f4ee"
  paper-raised: "#fbf9f5"
  paper-sunk: "#efebe3"
  ink: "#171715"
  ink-2: "#45443f"
  ink-3: "#64635c"
  seam: "rgb(23 23 21 / 0.12)"
  seam-strong: "rgb(23 23 21 / 0.28)"
  hover: "rgb(23 23 21 / 0.05)"
  room: "#0b0b0a"
  room-raised: "#141412"
  room-ink: "#f2efe8"
  room-ink-2: "#c9c6be"
  room-ink-3: "#a3a19a"
  room-seam: "rgb(242 239 232 / 0.14)"
typography:
  display:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 3.6vw, 4.5rem)"
    fontWeight: 740
    lineHeight: 0.94
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 66"
  headline:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 1.2rem + 1.2vw, 2.2rem)"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 72"
  lede:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 0.9rem + 0.8vw, 1.45rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.07em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 88"
rounded:
  hatch: "2px"
  stamp: "3px"
  chip: "4px"
  control: "6px"
  field: "8px"
  plate: "10px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "72px"
  s9: "112px"
  s10: "160px"
  gutter: "clamp(16px, 4vw, 48px)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
  stamp:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.stamp}"
    padding: "0.18em 0.5em 0.14em"
  stamp-preview:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.stamp}"
  chip:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.chip}"
    padding: "0 16px"
    height: "40px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  input-search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 16px 0 44px"
    height: "52px"
  nav-link:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "12px"
  plate:
    backgroundColor: "{colors.room}"
    textColor: "{colors.room-ink}"
    rounded: "{rounded.plate}"
    padding: "clamp(8px, 1.2vw, 14px)"
---

# Design System: NOVA preview site

## Overview

**Creative North Star: "The Projected Catalogue"**

The site is NOVA's own catalogue, set on paper stock and projected. Pages are cream paper with ink type, divided by hairline seams and heavier 1.5px rules, the way a printed film catalogue or an archive ledger is ruled. The app itself never appears as an illustration: it is shown as real captures inside darkroom plates, near-black frames captioned like catalogue prints with their plate number and provenance. Whole sections can drop into the darkroom (the footer, the Projector, the 404) by switching stock rather than adding decoration.

One colour carries meaning: ember, the diagonal beam from the Lumen N. It is the wordmark's beam, the header's page seek bar, the Projector's playhead, the marker on the Atlas entry being read, the current-page marker in narrow navigation and the docs sidebar, and the focus ring. Everywhere it says "this is where you are now". Everything else, including every status mark, is ink. Density is editorial: generous section padding (112px), condensed display titles at large scale, normal-width text at a calm 1.0625rem.

The system honours a dark scheme by swapping paper and ink stock (Night) while the darkroom stays dark whatever the theme. Motion is a single grammar: things enter along the beam's slope (15.3 degrees from vertical) or rise a few pixels, eased out, and all of it falls away under reduced motion.

**Key Characteristics:**
- Cream and ink paper stock; a near-black darkroom stock for the app and for whole sections.
- One ember accent, used only as the beam or playhead meaning "now", plus focus.
- Archivo variable in two voices: condensed spine titles, normal-width reading text.
- Status shown as ink stamps distinguished by border style, never by colour.
- Hairline seams and 1.5px rules instead of cards and shadows; the plate is the one lifted object.
- The beam's 15.3 degree slope recurs as hatching, playhead skew and the Projector's exposure wipe.

## Colors

A near-monochrome paper-and-ink palette with one warm signal colour.

### Primary
- **Beam Ember** (`ember`): a fill colour, never a text colour on cream (2.6:1). Used only for the wordmark beam, the header seek fill and playhead, the Projector track fill and playhead, the skewed marker on the open Atlas entry, current-page beam markers (narrow nav, docs sidebar), the caret, the selection tint (30% alpha) and the dark-scheme focus ring.
- **Ember Text** (`ember-text`): the legible ember for type and for the light-scheme focus ring (5.2:1 on cream). In Night and darkroom stock it lifts to #fb9a52 and focus becomes Beam Ember itself.

### Neutral
- **Cream Paper** (`paper`): the page. **Raised Paper** (`paper-raised`) for control panels, evidence drawers and keycaps. **Sunk Paper** (`paper-sunk`) for inline code, status notes, blockquotes and the active docs link.
- **Print Ink** (`ink`): headings, primary text, primary buttons, filled stamps, selected chips, the 1.5px rules. **Ink 2** (`ink-2`) for ledes and secondary text. **Ink 3** (`ink-3`) for captions, labels and muted metadata.
- **Seam** (`seam`) for hairline dividers; **Seam Strong** (`seam-strong`) for control borders and resting link underlines; **Hover** (`hover`) as the only hover wash.
- **Darkroom** (`room`) and **Darkroom Raised** (`room-raised`): the plate and darkroom sections. **Room Ink 1-3** (`room-ink`, `room-ink-2`, `room-ink-3`) and **Room Seam** (`room-seam`) mirror the ink ramp on dark stock. A darkroom section re-points the paper and ink tokens to these, so components inside work unchanged.
- **Night stock** (dark scheme): paper becomes #141412 / #1c1c19 / #0e0e0d and ink becomes #f2efe8 / #c9c6be / #a19f98; seams invert to cream alpha. Values live in the sidecar.

### Named Rules
**The One Beam Rule.** Ember appears only as the beam: a playhead, a seek fill, or a skewed parallelogram marking the current item, plus focus. It never fills a button, a badge, a heading or a status. If an orange element doesn't mean "now", it is wrong.

**The Fill Not Text Rule.** Beam Ember is a fill. Any ember-coloured text uses Ember Text.

## Typography

**Display Font:** Archivo variable, self-hosted latin subset (with Segoe UI Variable Text, Segoe UI, system-ui)
**Body Font:** Archivo at normal width (same stack)
**Label Font:** Archivo at 88% width, uppercase, tabular figures

**Character:** one family on its width axis. The condensed spine voice reads like titles on a film catalogue's spines; the normal-width text voice is quiet and long-form legible.

### Hierarchy
- **Display / spine-xl** (740, 66% width, section heads clamp(2.25rem to 4.5rem), page h1 clamp(3rem to 6rem), line-height 0.94, -0.02em): section and page titles, the release version, closing statements.
- **Headline / spine** (650, 72% width, line-height 1.05, -0.01em): hero h1 (clamp(2.3rem to 3.6rem), max 14ch), claim and chapter titles (clamp(1.6rem to 2.2rem)), Projector chapter titles (clamp(1.9rem to 2.8rem)), the footer line. Docs prose h2 uses 72% width at 2rem; h3 80% at 1.35rem.
- **Lede** (400, clamp(1.15rem to 1.45rem), line-height 1.45, Ink 2, max 38ch by default): the one framing paragraph under a title.
- **Body** (400, 1.0625rem, line-height 1.6): reading text at 60-70ch; docs prose at 1.02rem, max 70ch.
- **Label / catalog** (600, 0.72rem, 0.07em, uppercase, 88% width, tabular): table headers, field labels, footer column heads, timecodes, catalogue numbers. Stamps use the same voice at 0.68rem, 650, 0.08em.

### Named Rules
**The Label Labels Data Rule.** The catalog voice labels a datum (a plate number, a timecode, a field, a column). It never sits above a heading as a kicker.

**The Two Widths Rule.** Titles are condensed (66-80% width); reading text is never condensed. Code is the only exception (92% width, 560 weight).

## Layout

A single centred wrap (max 1320px, minus a fluid gutter of clamp(16px, 4vw, 48px) each side) on a 4-to-160px spacing scale. Sections pad 112px vertically (72px when tight); headings sit 48px above their content. Two-column splits are asymmetric 5:7 or 6:5 grids with a 48px gap (hero, Atlas teaser, close) and collapse to one column at 1000px. Lists of claims, specs and Atlas entries are ruled rows rather than grids of cards: a baseline-aligned grid per row with a hairline below. The Projector pairs an 8:3.4 frame and notes column, collapsing at 960px. The header nav collapses into a Menu button below 900px (links stay in a scrollable row without script). Measures are explicit: lede 38ch, body 60-70ch, docs column 82ch.

## Elevation & Depth

Flat paper by default. Depth comes from changing stock (paper, sunk, raised, darkroom) and from rules, not shadows. The plate is the one physical object: a darkroom print lifted off the page by a soft, low shadow. The Projector frame casts a deep shadow on darkroom stock. Inputs show focus with a 3px ember halo.

### Shadow Vocabulary
- **Plate lift** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.04) inset, 0 24px 60px -24px rgb(23 23 21 / 0.45), 0 6px 16px -8px rgb(23 23 21 / 0.3)`): darkroom plates on paper only.
- **Projection** (`box-shadow: 0 0 0 1px var(--room-seam), 0 40px 80px -40px rgb(0 0 0 / 0.9)`): the Projector frame on darkroom stock.
- **Field focus halo** (`box-shadow: 0 0 0 3px color-mix(in oklab, var(--ember) 30%, transparent)`): text fields on focus, with the border turning to the focus colour.

### Named Rules
**The Stock Not Shadow Rule.** To set something apart, change its stock (sunk, raised, darkroom) or rule it. Only plates and the Projector frame carry a shadow.

## Shapes

Small, precise radii scaled by object size: 2px tier swatches, 3px stamps, 4px chips and inline code, 5-6px buttons, nav links and keycaps, 8px fields, notes and image frames, 10px plates and control panels. Rules are 1px seams for dividers and 1.5px solid ink for structural heads (section heads, Atlas list top, docs head, footer top). The recurring silhouette is the beam: a parallelogram skewed -15.3 degrees, used for playheads and current-item markers, and as 105 degree hatching for partial tiers.

## Components

### Buttons
Quiet and solid; ink, not ember.
- **Shape:** gently squared (6px), 44px minimum height (48px beside the quick-check field), 24px side padding, 600 weight at 0.98rem.
- **Primary:** ink fill, paper text. Hover mixes ink 86% toward paper; press scales to 0.97.
- **Ghost:** transparent with a Seam Strong border; hover adds the hover wash and an Ink 3 border.
- **In darkroom:** primary inverts to room ink on darkroom; ghost takes a room seam border.
- **Arrow link:** a 600-weight text link with a drawn arrow that nudges 3px right on hover.

### Status Stamps
Ink-stamp marks, as in the app's library. Uppercase label voice, 1.5px border, 3px radius. Tiers differ by border style and tone, never by colour: Verified solid ink; Partial solid ink hatched at 105 degrees; Expected and Planned dashed Ink 2; External double 3px Ink 2; Unsupported, Deferred and None dotted Ink 3; Preview a filled ink stamp (inverted inside the ink notice bar).

### Chips
- **Style:** 40px tall, 1.5px Seam Strong border, 4px radius (6px for the square variant), 560 weight at 0.92rem in Ink 2.
- **State:** hover darkens border and text; checked fills ink with paper text; focus is a 3px ring offset 2px.

### Inputs / Fields
- **Style:** paper background, 1.5px Seam Strong border, 8px radius; search is 52px tall with an inline 18px icon, selects 44px with a drawn chevron.
- **Focus:** border turns to the focus colour plus the 3px ember halo. Caret is ember.

### Navigation
Opaque paper header, sticky, 64px bar with the 92px wordmark at left. Links are 560 weight at 0.95rem in Ink 2 with a hover wash; the current page goes to ink, 650 weight, with a 2px ink underline bar. Under the bar runs the page seek bar: a 2px seam track, ember fill scaled to reading progress and a beam-shaped ember playhead. Below 900px a Menu button opens a stacked list at 80% width, 1.35rem, ruled rows; the current page carries a small ember beam at its right edge. Above the header, an ink notice bar carries the Preview stamp.

### Plate (signature)
A darkroom print of a real capture: room stock, 10px radius, fluid padding, image at 5px radius, and a caption row in Room Ink 2 with "Plate NN" in the catalog voice and the film credit in Room Ink 3.

### Projector (signature)
A tablist drawn as a seek bar. A 3px track with ember fill and a skewed ember playhead (with a darkroom keyline) moves to the selected chapter; chapters are ticks with labels and catalog timecodes. Arrow keys, Home and End scrub. A new frame is exposed by a clip-path wipe along the beam slope with a brief brightness flash; notes rise in a 40ms stagger.

### Atlas entries and tier ledger
Atlas entries are ruled disclosure rows (number, name and spec, area, stamp) under a 1.5px ink top rule; the open entry's number carries a skewed ember marker, and its evidence opens in a raised-paper drawer with label-voice terms. The tier ledger is a 44px bar of ink segments using the same border-style and hatching vocabulary as the stamps.

## Do's and Don'ts

### Do:
- **Do** keep ember to the beam: seek fills, playheads, skewed current-item markers and focus. One meaning, "now".
- **Do** distinguish every status by border style and tone in ink (solid, hatched, dashed, double, dotted, filled).
- **Do** set section heads as a spine-xl title on a 1.5px rule, with no number.
- **Do** put catalogue numbers on plate captions and Atlas entries; ordered lists may carry two-digit ordinals as list markers.
- **Do** show the app only as real captures in darkroom plates, each captioned with its provenance.
- **Do** carry the 15.3 degree beam slope into any new skew, hatch or wipe.
- **Do** separate content with seams, rules and stock changes.

### Don't:
- **Don't** use ember as a button fill, badge, heading colour, status colour or decorative bullet.
- **Don't** set Beam Ember as text on cream; use Ember Text.
- **Don't** place a catalog-voice label above a heading as a kicker.
- **Don't** number section heads.
- **Don't** wrap content in shadowed cards; only plates and the Projector frame cast shadows.
- **Don't** condense reading text, or set the NOVA wordmark in a font: it is the Lumen artwork.
- **Don't** make the header translucent; it is opaque paper.

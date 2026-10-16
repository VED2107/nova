# NOVA website — audit and proposal (preview)

Status: proposal, 2026-10-16. Nothing is deployed. Public downloads stay disabled until ADR 0003 and the licence review are resolved.

## 1. Audit — what is true today

| Area | Finding | Consequence for the site |
| --- | --- | --- |
| Repo | Monorepo (`apps/desktop`, `crates/*`, pnpm workspace). No website exists. No git remote, no hosting config, CI is Windows desktop only. | New `apps/site`. No public repository link can be shown yet. Deploy target must be chosen. |
| Brand | `brand/final`: Lumen N symbol, wordmark (its N *is* the symbol), favicons, manifest. Ink `#171715`, cream `#F7F4EE`, ember `#F97316` (fill, not text on cream: 2.8:1). Archivo variable font (OFL) in the desktop app. | Reuse masters as-is; never set "NOVA" in a font; ember only as fill/beam/"now" on cream; ember text only on ink. |
| Design direction | Desktop "Spine Catalog": catalogue numbers (`NO. 002`), ink-on-paper stamps (In progress / Watched / Missing), condensed spine headings, Darkroom player. | The site extends this world rather than inventing one. |
| Licence | `license = "UNLICENSED"`, no LICENSE file. libmpv build is GPL (x264/x265). ADR 0003 recommends an LGPL self-build. | The site may not say "open source" as a present fact. It says: *planned to be open source; licence not yet chosen.* |
| Privacy | Engine isolation (`config=no`, `load-scripts=no`, `ytdl=no`); WebView CSP allows only `self`/IPC/asset; no HTTP client in the app's runtime dependency tree; no telemetry code. **No traffic capture has been done.** | Say "no account, no telemetry or analytics in NOVA's code; files never uploaded". Do not say "makes no network connections" (WebView2 and Windows may). |
| Compatibility | `docs/compat/README.md` (tiers) + `results-no.json` / `results-auto_copy.json` (55 synthetic samples × software and hardware passes, 55/55 met expectation) + `engine-audit.tsv`. | The Atlas is generated from these files at build time. "Verified" always means "synthetic profile sample", never "real camera file". |
| Product | RC1 audit (`docs/testing/rc1-local-windows.md`): verified/partial/deferred per feature. Installer built and tested locally only. | Showcase uses only Verified features; Partial is labelled. |
| Imagery | Real captures exist but show SMPTE-style test patterns only. | Re-capture the app playing a CC-BY film (Blender Foundation open movie) for product shots, with attribution. Test-pattern shots stay usable for the Inspector/Atlas where the pattern is the point. |

## 2. Creative concept — "The Catalogue, projected"

NOVA's mark is light passing through a frame. The desktop app files media like a catalogue. The website is **NOVA's own catalogue entry, projected**: an editorial object where every section is a numbered entry with a spec line and an honest stamp, and a single ember beam (the N's diagonal, 15.3°) acts as the playhead that moves the visitor through it.

It refuses the category default (dark hero, glowing gradient, three feature cards, big Download button). It is cream paper by day and darkroom by night, typographic, dense where evidence lives and quiet where the product image leads.

**Recurring signatures**
- **Catalogue numbering and stamps** — `NO. 001`… on every section; status stamps (Verified, Partial, Expected, Needs vendor SDK, Unsupported, Preview) in the app's ink-stamp language.
- **The beam** — one ember element per view, always meaning "now": the playhead, the active tab, focus.
- **Timecode margin** — sections carry a reading timecode (`00:00:12`) like chapter marks, linking reading to playback.

## 3. Signature elements

**A. Lumen opening.** The wordmark at full width, built from the brand master SVG. On load the beam sweeps once through the stencil gap (≈700 ms, transform/opacity only) and the frame "exposes" the first product capture. Static on reduced motion; content readable before and without the animation.

**B. Living product ("The Projector").** Real captures in a single darkroom frame. A timeline-styled tablist (chapters as ticks on a seek bar: Library · Playing · Paused · Queue · Inspector · Settings · Formats · Finished · Error). Arrow keys move chapters; the beam is the playhead. Each chapter: one sentence of value and one Verified/Partial stamp. Captions say what is real ("captured from NOVA 0.1.0 on Windows 11").

**C. NOVA Media Atlas.** A card-catalogue index, not a codec wall: filter by status, category (delivery, camera profile, intermediate, lossless, high-end, audio, robustness, RAW, project files) and capability (HDR, alpha, 10-bit, 4:2:2). Each entry opens to its evidence: sample, software/hardware pass, decoder, bit depth/chroma, limitation, and a link to the source document. A standing note: *a container being recognised does not mean every codec or profile inside it decodes.*

## 4. Site map

| Route | Purpose |
| --- | --- |
| `/` Home | What NOVA is, why it differs, the Projector preview, Atlas preview, principles, privacy, status. |
| `/product` | Chapters: Playback, Discovery, Control, Insight, Continuity, Themes — real captures only. |
| `/atlas` | Full Media Atlas. |
| `/compare` | NOVA beside VLC, mpv and MPC-HC on scoped, sourced criteria; NOVA columns distinguish verified from planned. |
| `/release` | Preview status. No download. Release-center structure ready for real metadata later. |
| `/trust` | Status, architecture, engine, privacy (local data inventory), testing method, licensing status, limitations, how to report issues. |
| `/docs` | Searchable entry: getting started, shortcuts (generated from the app's action registry), playback, library, troubleshooting; in-progress sections labelled. |
| `404` | Branded not-found. |

## 5. Implementation

- **Stack:** Astro (static output, zero JS by default, islands only for the Projector, Atlas filters and docs search). Plain CSS with tokens copied from the desktop `index.css` values; self-hosted Archivo (`font-display: swap`, subset WOFF2). One dependency (`astro`), plus `@astrojs/check` for types. Rationale: seven static pages need shared layout and build-time data loading; the desktop Vite/React setup is an app shell, not a static site generator.
- **Data:** `src/data/atlas.ts` loads `docs/compat/*.json` and parses the README tiers at build time; shortcuts come from the desktop `actions.ts`. No hand-maintained copies.
- **Assets:** brand masters copied by a script from `brand/final`; captures as AVIF/WebP with explicit dimensions.
- **No** analytics, trackers, external fonts or CDNs, API calls, or installer artifacts in the output.

## 6. Quality plan

Build + `astro check`; unit tests for the Atlas parser (counts must match the docs: 55 samples, tiers); link check over `dist/`; Playwright (webapp-testing skill) for keyboard paths, focus, reduced motion and 390/768/1280/1600 captures; contrast measured on rendered pages; a `dist/` scan that fails on `.exe`, local paths (`C:\`, `Users\`) and secrets.

## 7. Deployment

The preview builds to static files. **Destination not decided** — options: local preview only (`pnpm --filter @nova/site preview`), or a private claude.ai artifact, or a host you name. Every page carries a "Preview" banner and `noindex` until launch.

## 8. Claims needing verification before they appear

1. "Open source" — blocked on licence choice (shown as planned).
2. "No network activity" — not verified by capture (not claimed).
3. Real camera files — none tested (all camera items say "profile sample").
4. HDR display / tone mapping — not verified by eye (Partial).
5. Platforms — Windows only, by design (owner decision 2026-10-16).
6. Competitor facts — sourced on 2026-10-16 from vendor pages; recheck before launch.
7. Trademark clearance of "NOVA" and the mark — not done.
8. Performance numbers — only one machine; shown, if at all, as harness measurements with the machine named.

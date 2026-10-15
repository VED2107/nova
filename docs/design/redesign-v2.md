# NOVA app redesign v2 — audit, decisions, verification

Branch `redesign/app-v2` (from `main` at `b686c63`). Not merged.

## 1. Audit (before)

Taken from captures of the installed 0.1.0 build at 1440×900 playing CC-BY Blender films (Tears of Steel, Sintel, Big Buck Bunny).

| Area | Problem |
| --- | --- |
| Home | Continue artwork ~580 px wide with its facts stacked underneath; ~40% of the width empty; "Recently added" a plain list repeating Continue; a thin folder rail adding nothing. |
| Library | Flat list, small thumbnails, a dead gap before the catalogue number; search opened with a permanent double focus ring; "Show missing" switch floating; no grid; no item menu. |
| Player | Camera/queue/info in the top bar, cut off from transport; thin timeline separate from the controls row; A–B, speed, subtitles and fullscreen at equal weight; advanced tools only in the right-click menu. |
| Player overlays | mpv draws subtitles under the WebView: they sat under the controls, and an open side panel covered the right of the picture and long subtitle lines. |
| Settings | 48 key bindings with no search; no confirmation that a change was saved. |
| Bugs found along the way | Go to time never focused its field (fixed on `main`, `bce1ff6`). |

## 2. Decisions and design system

- **Identity kept:** Lumen N wordmark, Archivo variable (condensed "spine" display, normal-width text), cream/ink/ember, Daylight/Night/Darkroom tokens. No new colours. Ember stays "now": playhead, current item, active toggle, focus.
- **Signature: the beam playhead.** The timeline's playhead is the N's diagonal: a 5×16 px ember parallelogram skewed 15.3°, growing to 22 px on hover/scrub/keyboard focus, with a dark keyline for bright footage. The native range input still carries keyboard and screen-reader behaviour.
- **The deck.** One transport: timeline on top; previous/play/next, time, volume left; a quiet group (A–B, speed, tracks) shown as text, ember only when not at default; a hairline; queue, details, **More** (every picture/sound/subtitle/frame tool, anchored above its button) and fullscreen. The top bar is only back, title/spec and immersive. Tooltips show the user's own key bindings.
- **Overlays respect the picture.** New contract commands `SetSubtitleMargin` (mpv `sub-margin-y`) and `SetVideoMarginRight` (`video-margin-ratio-right`): subtitles rise above the deck while it is visible; a side panel reserves its width so the picture re-centres beside it. Validated in `nova-playback-api` (tests added).
- **Home as a destination.** Lead title with artwork and facts side by side (compact with one item or many); more in-progress titles and recent additions as an artwork grid (`MediaCard`, shared with Library); "Your shelf" with real counts and folders; playlist spines; a composed first-launch view with two actions and three true promises.
- **Library for scanning and inspecting.** Grid (virtualised by row) and List (aligned columns: length, picture, size, folder, status; columns drop out as the window narrows); choice remembered per device (localStorage, guarded). Right-click: Play/Resume, Add to queue. "Missing files" is a pressed toggle; the empty state says how many missing titles are hidden.
- **Settings.** Find actions by name or key; a "Saved" mark (and screen-reader announcement) when Rust confirms a preference write.
- **Motion.** Kept to existing durations (140–220 ms, strong ease-out), transform/opacity/height only, all collapsed under reduced motion.

## 3. Verification

| Check | Result |
| --- | --- |
| Rust workspace tests | pass (playback-api 33 incl. new validation cases; application 19; domain 20; storage 28; engine 18; …) |
| Vitest | 38/38 (new: dialog autofocus, key search) |
| `tsc`, clippy `-D warnings`, rustfmt, `pnpm build` | clean |
| Contrast (computed from tokens; overlays at the scrim's darkest stop over white video) | Day ink-3 on paper-sunk 5.07:1, ember-text on paper 5.24:1; Night ink-3 6.94:1; deck text 6.80–10.30:1; panel text 9.78:1; beam vs track 4.51:1 (UI component, ≥3:1). Not sampled from rendered pixels. |

**Inspected in the running app** (debug build, isolated profile, guarded input): player playing with the beam timeline and hover time; subtitles lifted with the deck shown and lowered with it hidden; More menu; queue panel with the picture re-centred; details panel; Home (Daylight, Night, 860×600); Library grid, list and item menu; Settings key search and the Saved mark in Night; Finished card at 860×600.

**Not inspected after the redesign:** error screen, Go to time dialog, track menus, A–B loop drawing on the new track, playlists with items on Home, the first-launch Welcome view, Library scanning progress, compact controls, fullscreen, very long file names, 125/150% display scaling.

## 4. Known issues and deferred

- Tooltips are the platform's native `title` tooltips (consistent, accessible names exist on every icon control); a styled tooltip is deferred.
- No timeline preview frames: generating frames on hover would need new engine work; not implied anywhere.
- Playlist order can only be changed by opening it, reordering the queue and saving under a new name.
- The Finished-card freeze seen once at 0:46/0:52 on Sintel (UI updated only after the next input) was not reproduced; the file's frames run to 52.17 s.
- The local installer has not been rebuilt from this branch.

# NOVA website

The NOVA website, live at <https://nova.snowbros.me>: Home, Product, Media Atlas, Compare, Release, Trust and Docs. It is a static Astro site with no analytics, no trackers and no third-party requests.

## Run it

From the repository root:

```bash
pnpm install
pnpm --filter @nova/site dev       # http://localhost:4321
pnpm --filter @nova/site build     # astro build + dist checks → apps/site/dist
pnpm --filter @nova/site preview   # serve the built site
pnpm --filter @nova/site check     # astro check (types)
pnpm --filter @nova/site test      # vitest: Atlas data and shortcuts
```

## Where the content comes from

| What | Source of truth |
| --- | --- |
| Media Atlas | `docs/compat/results-no.json`, `results-auto_copy.json`, `engine-audit.tsv` and `README.md`, read at build time by `src/data/compat.ts`. Tests fail if the README phrases, sample ids or decoder names drift. |
| Keyboard shortcuts | `apps/desktop/src/services/playback/actions.ts`, parsed by `src/data/shortcuts.ts` |
| Engineering records under `/docs` | `docs/**` files listed in `src/lib/docs-map.mjs`, rendered unedited |
| Feature statuses, gates, comparison | `src/data/facts.ts`, transcribed from `docs/testing/rc1-local-windows.md`, ADR 0003 and vendor pages (checked 2026-10-16) |
| Release records and downloads | `src/data/releases.json` |
| Product captures | `public/shots/` (NOVA 0.1.0 playing Blender Foundation films, CC BY 3.0; credits in `src/data/shots.ts` and on `/trust#credits`) |
| Brand icons | `brand/final/`, copied by `pnpm --filter @nova/site sync:brand` |
| Social image | `public/og.png`, built by `python scripts/make-og.py` |

## Downloads

Release records live in `src/data/releases.json`. `scripts/check-dist.mjs` fails the build for an installer link that is not in a release record with an https URL, a SHA-256 and a notices page; a `"gpl"` engine build (0.1.0) must also point at its corresponding source. It also fails on executables in the output, private paths, secrets, external requests, broken links, `noindex` on public pages, and a canonical URL that isn't `nova.snowbros.me`.

To publish a new version: create the GitHub release with the installer and source archives first, then add its record at the top of `releases.json` and redeploy.

## Deploying on Vercel

The site is deployed from this repository at <https://nova.snowbros.me>.

- **Root Directory:** `apps/site`, with **Include files outside the root directory** on (the build reads `docs/` and the desktop action registry).
- **Environment:** `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses the pinned `pnpm@11.1.1`.
- Framework, build command and output come from `apps/site/vercel.json`, which also sets a strict CSP and cache headers.
- `SITE_URL` overrides the canonical host, for example for a staging domain.

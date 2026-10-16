# NOVA website (preview)

The NOVA preview site: Home, Product, Media Atlas, Compare, Release, Trust and Docs. It is a static Astro site with no analytics, no trackers and no third-party requests. Every page carries `noindex` until launch.

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

There is no download. A release record may only carry one when its installer bundles the **LGPL engine build** (ADR 0003, option B). `scripts/check-dist.mjs` fails the build for any installer link that is not in `releases.json` with `"engine": "lgpl"`, a SHA-256, an https URL and a notices page. It also fails on executables in the output, private paths, secrets, external requests and broken links. Never add the local 0.1.0-rc.1 installer: it bundles the GPL development engine.

## Deploying on Vercel

1. In Vercel: **Add New → Project**, import `VED2107/nova`.
2. **Root Directory:** `apps/site`. Keep **Include files outside the root directory** on: the build reads `docs/` and the desktop action registry.
3. The framework preset (Astro), build command (`pnpm run build`) and output (`dist`) come from `apps/site/vercel.json`.
4. Deploy a **Preview** (any branch other than the production branch, e.g. `site/preview`). Leave Deployment Protection on while the site is a preview.
5. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses the pnpm version pinned in the root `package.json` (`pnpm@11.1.1`).
6. `vercel.json` adds `X-Robots-Tag: noindex`, a strict CSP and cache headers. Set `SITE_URL` if the canonical host should differ from the Vercel URL.

From a terminal instead: `cd apps/site && npx vercel` (preview), never `--prod` before launch.

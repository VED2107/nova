import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { REPO_DOCS, DOC_BY_PATH } from "./lib/docs-map.mjs";

/** Engineering records, rendered from the repository's docs/ (allow-listed in docs-map). */
const records = defineCollection({
  loader: glob({
    base: "../../docs",
    pattern: REPO_DOCS.map((d) => d.path.replace(/^docs\//, "")),
    generateId: ({ entry }) => DOC_BY_PATH.get(`docs/${entry}`)?.slug ?? entry,
  }),
});

/** User guides written for this site from the app's implementation and test record. */
const guides = defineCollection({
  loader: glob({ base: "./src/content/guides", pattern: "*.md" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    status: z.enum(["current", "incomplete"]),
    statusNote: z.string(),
  }),
});

export const collections = { records, guides };

import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import { rehypeRepoDocs } from "./src/lib/rehype-repo-docs.mjs";

// Absolute URLs for canonical and social metadata. Vercel provides the
// deployment host; locally the preview server is used.
const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:4321");

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  markdown: {
    syntaxHighlight: false,
    processor: unified({ rehypePlugins: [rehypeRepoDocs] }),
  },
  vite: {
    // Compatibility data and engineering records are read from the repository's docs/.
    server: { fs: { allow: ["../.."] } },
  },
});

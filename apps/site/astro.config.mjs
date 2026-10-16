import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import { rehypeRepoDocs } from "./src/lib/rehype-repo-docs.mjs";

// Absolute URLs for canonical, sitemap and social metadata: the production
// domain unless SITE_URL overrides it.
const site = process.env.SITE_URL ?? "https://nova.snowbros.me";

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

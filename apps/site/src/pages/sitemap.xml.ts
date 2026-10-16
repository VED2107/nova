import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

/** Every public page, generated at build time. */
export const GET: APIRoute = async ({ site }) => {
  const guides = await getCollection("guides");
  const records = await getCollection("records");
  const paths = [
    "/",
    "/product",
    "/atlas",
    "/compare",
    "/release",
    "/trust",
    "/docs",
    "/docs/shortcuts",
    ...guides.map((g) => `/docs/${g.id}`),
    ...records.map((r) => `/docs/${r.id}`),
  ];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};

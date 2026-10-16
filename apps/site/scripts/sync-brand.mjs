// Copies the web icon set from the brand masters (brand/final) into public/.
// Run after `python brand/build_brand.py` changes the masters.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = new URL("../../../brand/final/", import.meta.url);
const to = new URL("../public/", import.meta.url);
for (const f of [
  "favicon.ico", "favicon.svg", "favicon-16.png", "favicon-32.png", "favicon-48.png",
  "apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png", "site.webmanifest",
]) {
  copyFileSync(fileURLToPath(new URL(f, from)), fileURLToPath(new URL(f, to)));
  console.log(`brand/final/${f} → public/${f}`);
}

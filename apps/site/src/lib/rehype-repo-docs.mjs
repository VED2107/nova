import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_BY_PATH } from "./docs-map.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

/**
 * Prepares repository Markdown for the site:
 * - links between published records point at their /docs pages;
 * - links to other repository files open on GitHub at the release tag;
 * - the document's own H1 is removed (the page renders the title);
 * - tables get a labelled, keyboard-scrollable wrapper.
 * Markdown outside the repository's docs/ (the site's own guides) only gets
 * the table wrapper.
 */
export function rehypeRepoDocs() {
  return (tree, file) => {
    const abs = file.path ? path.resolve(file.path) : "";
    const rel = abs ? path.relative(REPO_ROOT, abs).split(path.sep).join("/") : "";
    const isRepoDoc = DOC_BY_PATH.has(rel);

    if (isRepoDoc) {
      const i = tree.children.findIndex((n) => n.type === "element" && n.tagName === "h1");
      if (i !== -1) tree.children.splice(i, 1);
    }

    walk(tree, (node, parent, index) => {
      if (node.type !== "element") return;
      if (node.tagName === "table" && !(parent.properties?.className ?? []).includes("table-scroll")) {
        parent.children[index] = {
          type: "element",
          tagName: "div",
          properties: { className: ["table-scroll"], tabIndex: 0, role: "region", ariaLabel: "Table (scrolls sideways)" },
          children: [node],
        };
        return;
      }
      if (!isRepoDoc || node.tagName !== "a") return;
      const href = String(node.properties?.href ?? "");
      if (!href || /^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return;
      const [target, hash] = href.split("#");
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target));
      const doc = DOC_BY_PATH.get(resolved);
      if (doc) {
        node.properties.href = `/docs/${doc.slug}${hash ? `#${hash}` : ""}`;
      } else {
        node.properties.href = `https://github.com/VED2107/nova/blob/v0.1.0/${resolved}${hash ? `#${hash}` : ""}`;
      }
    });
  };
}

/** Visits every descendant; `fn` may replace `parent.children[index]`, and the replacement is walked. */
function walk(parent, fn) {
  if (!parent.children) return;
  for (let i = 0; i < parent.children.length; i++) {
    fn(parent.children[i], parent, i);
    walk(parent.children[i], fn);
  }
}

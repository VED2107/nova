/**
 * NOVA is a desktop app that happens to run in a WebView: the browser's own
 * context menu (Back, Reload, Inspect…), reload, print and page zoom must
 * never surface. Text fields keep their native Cut / Copy / Paste menu.
 */
export function suppressBrowserChrome(): void {
  const editable = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  };
  // Our own menus call preventDefault themselves; everything else gets nothing.
  document.addEventListener("contextmenu", (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const browserKey =
        k === "f5" ||
        (ctrl && (k === "r" || k === "p" || k === "u" || k === "s" || k === "g" || k === "j")) ||
        (ctrl && (k === "+" || k === "=" || k === "-" || k === "0") && !e.altKey) ||
        (e.altKey && (k === "arrowleft" || k === "arrowright") && !ctrl); // history back/forward
      if (browserKey) e.preventDefault();
    },
    true,
  );
  // Ctrl + wheel is page zoom in a browser; in NOVA it means something only over the picture.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
}

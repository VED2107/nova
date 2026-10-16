import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon } from "./icons";

/**
 * The OSD ladder: NOVA's one menu component. A short first level at the
 * pointer (or above a trigger); each row is a label, a live readout and, for
 * groups, a chevron that steps a submenu out sideways. Used for the player's
 * right-click menu, the deck's readout keys and library items.
 *
 * Pointer: submenus open on hover after a short intent delay; moving towards
 * an open submenu across other rows does not switch it (a pointer corridor).
 * Keyboard: Up/Down/Home/End, Right/Enter/Space opens a submenu, Left closes
 * it, Esc closes one level, letters jump to the next matching row.
 */
export type OsdNode =
  | {
      kind: "item";
      id: string;
      label: string;
      /** Right-aligned readout or key hint. */
      value?: string;
      hint?: string;
      /** Checkbox (true/false) or radio (with `radio`) state; undefined = plain action. */
      checked?: boolean;
      radio?: boolean;
      disabled?: boolean;
      /** Why a disabled row is unavailable; read aloud and shown as a tooltip. */
      reason?: string;
      /** Keep the menu open after running (steppers such as delays). */
      keepOpen?: boolean;
      run: () => void;
    }
  | { kind: "sub"; id: string; label: string; value?: string; disabled?: boolean; reason?: string; children: OsdNode[] }
  | { kind: "sep"; id: string }
  | { kind: "label"; id: string; text: string };

type Tone = "room" | "paper";

const OPEN_DELAY_MS = 90;
const CORRIDOR_GRACE_MS = 280;
const EDGE = 8;

export function OsdMenu(props: {
  nodes: OsdNode[];
  label: string;
  onClose: () => void;
  /** Pointer position (right-click) … */
  x?: number;
  y?: number;
  /** … or the trigger to open above (deck keys). */
  anchor?: DOMRect;
  tone?: Tone;
  /** Opened from the keyboard: no entrance motion, first row focused. */
  fromKeyboard?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Focus returns to whatever had it before the menu opened.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => {
      const active = document.activeElement;
      if (before?.isConnected && (active == null || active === document.body || rootRef.current?.contains(active))) before.focus({ preventScroll: true });
    };
  }, []);

  // Outside press, window blur and resize close the whole ladder.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // A press on the trigger is left to the trigger, which toggles the menu closed;
      // closing here too would make that click open it again.
      const a = props.anchor;
      if (a && e.clientX >= a.left && e.clientX <= a.right && e.clientY >= a.top && e.clientY <= a.bottom) return;
      props.onClose();
    };
    const close = () => props.onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [props.onClose, props.anchor]);

  return (
    <div ref={rootRef} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <Level
        nodes={props.nodes}
        label={props.label}
        tone={props.tone ?? "room"}
        place={props.anchor ? { kind: "above", rect: props.anchor } : { kind: "point", x: props.x ?? 0, y: props.y ?? 0 }}
        animate={!props.fromKeyboard}
        autoFocus={props.fromKeyboard ? "row" : "menu"}
        onCloseAll={props.onClose}
        depth={0}
      />
    </div>
  );
}

type Place = { kind: "point"; x: number; y: number } | { kind: "above"; rect: DOMRect } | { kind: "beside"; rect: DOMRect };

function Level(props: {
  nodes: OsdNode[];
  label: string;
  tone: Tone;
  place: Place;
  animate: boolean;
  /** "row": focus the first row (keyboard); "menu": focus the menu itself (pointer); false: leave focus. */
  autoFocus: "row" | "menu" | false;
  depth: number;
  onCloseAll: () => void;
  /** Closes this level only (submenus); focus goes back to the parent row. */
  onCloseSelf?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const [openSub, setOpenSub] = useState<{ id: string; rect: DOMRect; focus: boolean } | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const corridor = useRef<{ x: number; y: number; until: number } | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const paper = props.tone === "paper";

  // Place inside the window: flip sideways for submenus, clamp everything.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    let origin: string;
    const p = props.place;
    if (p.kind === "point") {
      const flipX = p.x + r.width > vw - EDGE;
      const flipY = p.y + r.height > vh - EDGE;
      left = flipX ? p.x - r.width : p.x;
      top = flipY ? p.y - r.height : p.y;
      origin = `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`;
    } else if (p.kind === "above") {
      left = p.rect.right - r.width;
      top = p.rect.top - r.height - 8;
      origin = "bottom right";
      if (top < EDGE) {
        top = p.rect.bottom + 8;
        origin = "top right";
      }
    } else {
      const right = p.rect.right - 4;
      left = right + r.width > vw - EDGE ? p.rect.left - r.width + 4 : right;
      top = p.rect.top - 5; // first row lines up with its parent row
      origin = "top left";
    }
    setPos({
      left: Math.max(EDGE, Math.min(left, vw - r.width - EDGE)),
      top: Math.max(EDGE, Math.min(top, vh - r.height - EDGE)),
      origin,
    });
  }, [props.place]);

  useEffect(() => {
    if (!pos || !props.autoFocus) return;
    if (props.autoFocus === "row") rows()[0]?.focus({ preventScroll: true });
    else ref.current?.focus({ preventScroll: true });
  }, [pos == null]);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const rows = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(":scope > [data-row]:not([aria-disabled=true])") ?? []);

  const openFor = useCallback((id: string, el: HTMLElement, focus: boolean) => {
    window.clearTimeout(openTimer.current);
    setOpenSub({ id, rect: el.getBoundingClientRect(), focus });
  }, []);

  const hoverRow = (node: OsdNode, el: HTMLElement, e: React.PointerEvent, force = false) => {
    window.clearTimeout(openTimer.current);
    if (node.kind === "sub" && node.disabled) return;
    // Moving towards the open submenu: keep it while the pointer is in the corridor.
    const c = corridor.current;
    if (!force && openSub && openSub.id !== (node as { id: string }).id && c && performance.now() < c.until && towards(c, e, openSub.rect)) {
      openTimer.current = window.setTimeout(() => hoverRow(node, el, e, true), CORRIDOR_GRACE_MS);
      return;
    }
    if (node.kind === "sub") {
      if (openSub?.id === node.id) return;
      openTimer.current = window.setTimeout(() => openFor(node.id, el, false), OPEN_DELAY_MS);
    } else if (openSub) {
      openTimer.current = window.setTimeout(() => setOpenSub(null), OPEN_DELAY_MS);
    }
  };

  const activate = (node: OsdNode, el: HTMLElement, viaKey: boolean) => {
    if (node.kind === "sub") {
      if (!node.disabled) openFor(node.id, el, viaKey);
      return;
    }
    if (node.kind !== "item" || node.disabled) return;
    node.run();
    if (!node.keepOpen) props.onCloseAll();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("[role=menu]") !== ref.current) return; // a submenu handles its own keys
    const list = rows();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => list[(n + list.length) % list.length]?.focus({ preventScroll: true });
    e.stopPropagation();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(i < 0 ? list.length - 1 : i - 1);
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(list.length - 1);
        break;
      case "ArrowRight":
      case "Enter":
      case " ": {
        const el = list[i];
        const node = el && props.nodes.find((n) => "id" in n && n.id === el.dataset.row);
        if (!el || !node) break;
        if (e.key === "ArrowRight" && node.kind !== "sub") break;
        e.preventDefault();
        activate(node, el, true);
        break;
      }
      case "ArrowLeft":
      case "Escape":
        e.preventDefault();
        if (props.onCloseSelf) props.onCloseSelf();
        else if (e.key === "Escape") props.onCloseAll();
        break;
      case "Tab":
        e.preventDefault();
        props.onCloseAll();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const now = performance.now();
          typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
          const start = typed.current.text.length > 1 ? i : i + 1;
          const order = [...list.slice(start), ...list.slice(0, start)];
          order.find((b) => (b.dataset.label ?? "").toLowerCase().startsWith(typed.current.text))?.focus({ preventScroll: true });
        }
    }
  };

  const tone = paper
    ? "border-seam-strong bg-paper-raised text-ink shadow-[0_14px_36px_-14px_rgb(23_23_21/0.38)]"
    : "border-room-seam bg-room-ply text-room-ink shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]";

  return (
    <>
      <div
        ref={ref}
        role="menu"
        aria-label={props.label}
        aria-orientation="vertical"
        data-animate={props.animate && props.depth === 0}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => {
          if (openSub) corridor.current = { x: e.clientX, y: e.clientY, until: performance.now() + 600 };
        }}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, transformOrigin: pos?.origin, zIndex: 60 + props.depth }}
        className={`osd-menu fixed max-h-[calc(100vh-16px)] min-w-[232px] max-w-[320px] overflow-y-auto rounded-[8px] border p-1 outline-none ${tone}`}
      >
        {props.nodes.map((node) => {
          if (node.kind === "sep") return <div key={node.id} role="separator" className={`mx-2 my-1 h-px ${paper ? "bg-seam" : "bg-room-seam"}`} />;
          if (node.kind === "label")
            return (
              <div key={node.id} role="presentation" className={`engrave px-2.5 pb-1 pt-2 ${paper ? "text-ink-3" : "text-room-ink-3"}`}>
                {node.text}
              </div>
            );
          const isSub = node.kind === "sub";
          const expanded = isSub && openSub?.id === node.id;
          const checked = node.kind === "item" ? node.checked : undefined;
          const role = isSub ? "menuitem" : checked === undefined ? "menuitem" : node.radio ? "menuitemradio" : "menuitemcheckbox";
          const reasonId = node.disabled && node.reason ? `${node.id}-why` : undefined;
          return (
            <button
              key={node.id}
              type="button"
              data-row={node.id}
              data-label={node.label}
              role={role}
              aria-checked={checked}
              aria-haspopup={isSub ? "menu" : undefined}
              aria-expanded={isSub ? expanded : undefined}
              aria-disabled={node.disabled || undefined}
              aria-describedby={reasonId}
              title={node.disabled ? node.reason : undefined}
              tabIndex={-1}
              onPointerEnter={(e) => hoverRow(node, e.currentTarget, e)}
              onPointerLeave={() => window.clearTimeout(openTimer.current)}
              onClick={(e) => activate(node, e.currentTarget, e.detail === 0)}
              className={[
                "osd-row flex h-[30px] w-full items-center gap-2 rounded-[5px] pl-1.5 pr-2 text-left text-[13px] outline-none",
                node.disabled ? "cursor-default opacity-40" : paper ? "hover:bg-[var(--hover)] focus:bg-[var(--press)]" : "hover:bg-white/[0.07] focus:bg-white/[0.11]",
                expanded ? (paper ? "bg-[var(--hover)]" : "bg-white/[0.07]") : "",
              ].join(" ")}
            >
              <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center ${paper ? "text-ember-text" : "text-ember"}`}>
                {checked && (node.kind === "item" && node.radio ? <span className="size-[7px] rounded-[1.5px] bg-current" /> : <CheckIcon size={14} />)}
              </span>
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              {node.value && <span className={`readout max-w-[42%] shrink-0 truncate text-[12px] ${paper ? "text-ink-2" : "text-room-ink-2"}`}>{node.value}</span>}
              {node.kind === "item" && node.hint && <span className={`shrink-0 text-[11.5px] ${paper ? "text-ink-3" : "text-room-ink-3"}`}>{node.hint}</span>}
              {isSub && <ChevronRightIcon size={14} className={`-mr-0.5 shrink-0 ${paper ? "text-ink-3" : "text-room-ink-3"}`} />}
              {reasonId && (
                <span id={reasonId} className="sr-only">
                  {node.reason}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {openSub &&
        (() => {
          const node = props.nodes.find((n) => n.kind === "sub" && n.id === openSub.id);
          if (!node || node.kind !== "sub") return null;
          return (
            <Level
              key={node.id}
              nodes={node.children}
              label={node.label}
              tone={props.tone}
              place={{ kind: "beside", rect: openSub.rect }}
              animate={false}
              autoFocus={openSub.focus ? "row" : false}
              depth={props.depth + 1}
              onCloseAll={props.onCloseAll}
              onCloseSelf={() => {
                setOpenSub(null);
                ref.current?.querySelector<HTMLButtonElement>(`[data-row="${CSS.escape(node.id)}"]`)?.focus({ preventScroll: true });
              }}
            />
          );
        })()}
    </>
  );
}

/** Is the pointer heading into the submenu's rectangle (inside the triangle from its last point to the near edge)? */
function towards(from: { x: number; y: number }, e: React.PointerEvent, sub: DOMRect): boolean {
  const right = sub.left > from.x;
  const edgeX = right ? sub.left : sub.right;
  const dx = Math.abs(e.clientX - from.x);
  if (right ? e.clientX < from.x : e.clientX > from.x) return false;
  // Allowed vertical drift grows with horizontal progress towards the submenu.
  const span = Math.abs(edgeX - from.x) || 1;
  const t = Math.min(1, dx / span);
  const top = from.y + (sub.top - 40 - from.y) * t;
  const bottom = from.y + (sub.bottom + 40 - from.y) * t;
  return e.clientY >= top && e.clientY <= bottom;
}

/** Small helper for building trees: a radio group of values. */
export function radios<T>(prefix: string, options: { value: T; label: string; hint?: string }[], current: T, onPick: (v: T) => void, disabled?: boolean, reason?: string): OsdNode[] {
  return options.map((o) => ({
    kind: "item" as const,
    id: `${prefix}:${String(o.value)}`,
    label: o.label,
    hint: o.hint,
    radio: true,
    checked: o.value === current,
    disabled,
    reason,
    run: () => onPick(o.value),
  }));
}


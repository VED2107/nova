import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon } from "../../components/icons";

export interface CtxItem {
  label: string;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  run: () => void;
}
export interface CtxGroup {
  title: string;
  items: CtxItem[];
}

/** Right-click menu at the pointer. Keyboard: arrows, Home/End, Enter, Esc. */
export function ContextMenu(props: { x: number; y: number; groups: CtxGroup[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.x, top: props.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [props.x, props.y]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onClose();
    };
    const blur = () => props.onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", blur);
    };
  }, [props.onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Player menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const list = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        const go = (n: number) => {
          e.preventDefault();
          list[(n + list.length) % list.length]?.focus();
        };
        e.stopPropagation();
        if (e.key === "Escape") props.onClose();
        else if (e.key === "ArrowDown") go(i + 1);
        else if (e.key === "ArrowUp") go(i - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(list.length - 1);
      }}
      className="fixed z-50 max-h-[78vh] w-[300px] overflow-y-auto rounded-[10px] border border-room-seam bg-room-glass p-1.5 text-room-ink shadow-[0_18px_44px_-12px_rgb(0_0_0/0.75)] backdrop-blur-xl"
    >
      {props.groups.map((g, gi) => (
        <div key={g.title} role="group" aria-label={g.title} className={gi > 0 ? "mt-1 border-t border-room-seam pt-1" : ""}>
          <div className="catalog px-2.5 pb-0.5 pt-1.5 text-room-ink-3">{g.title}</div>
          {g.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={it.checked}
              disabled={it.disabled}
              onClick={() => {
                it.run();
                props.onClose();
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-[5px] text-left text-[13px] outline-none hover:bg-white/8 focus-visible:bg-white/10 disabled:opacity-35"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-ember">{it.checked && <CheckIcon size={15} />}</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.hint && <span className="shrink-0 text-[11.5px] text-room-ink-3">{it.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

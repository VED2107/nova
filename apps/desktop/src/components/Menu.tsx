import { useEffect, useRef, type ReactNode } from "react";
import { CheckIcon } from "./icons";

export interface MenuItem {
  key: string;
  primary: string;
  secondary?: string;
  selected: boolean;
  onSelect: () => void;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
  empty?: string;
}

/**
 * Darkroom popover anchored above its trigger (opens from the bottom edge).
 * Keyboard: arrows/Home/End move between items, Esc closes and returns focus
 * to the trigger, Tab leaves. Selection keeps the menu's radio semantics.
 */
export function Menu(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  sections: MenuSection[];
  align?: "left" | "right";
  width?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio], [data-menu-focus]") ?? []);

  useEffect(() => {
    if (!props.open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) props.onClose();
    };
    window.addEventListener("pointerdown", onDown);
    const first = ref.current?.querySelector<HTMLButtonElement>("[aria-checked='true']") ?? items()[0];
    first?.focus();
    return () => {
      window.removeEventListener("pointerdown", onDown);
      // Return focus to the trigger if focus is still inside the menu.
      if (ref.current?.contains(document.activeElement)) trigger?.focus();
    };
  }, [props.open]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={props.label}
      data-open={props.open}
      onKeyDown={(e) => {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        const go = (n: number) => {
          e.preventDefault();
          e.stopPropagation();
          list[(n + list.length) % list.length]?.focus();
        };
        if (e.key === "Escape") {
          e.stopPropagation();
          props.onClose();
        } else if (e.key === "ArrowDown") go(i + 1);
        else if (e.key === "ArrowUp") go(i - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(list.length - 1);
      }}
      onClick={(e) => e.stopPropagation()}
      style={{ width: props.width }}
      className={[
        "absolute bottom-[calc(100%+10px)] z-30 min-w-60 max-w-[22rem] rounded-[10px] border border-room-seam",
        "bg-room-glass p-1.5 text-room-ink shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl",
        "transition-[opacity,transform] duration-150 ease-(--ease-out-strong)",
        "data-[open=false]:pointer-events-none data-[open=false]:translate-y-1 data-[open=false]:scale-[0.98] data-[open=false]:opacity-0",
        props.align === "left" ? "left-0 origin-bottom-left" : "right-0 origin-bottom-right",
      ].join(" ")}
    >
      {props.children}
      {props.sections.map((section, i) => (
        <div key={i} role="group" aria-label={section.title} className={i > 0 ? "mt-1 border-t border-room-seam pt-1" : ""}>
          {section.title && <div className="catalog px-2.5 pb-1 pt-1.5 text-room-ink-3">{section.title}</div>}
          {section.items.length === 0 && section.empty && <div className="px-2.5 py-2 text-[13px] text-room-ink-3">{section.empty}</div>}
          {section.items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={item.selected}
              tabIndex={-1}
              onClick={() => {
                item.onSelect();
                props.onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[13.5px] outline-none hover:bg-white/8 focus-visible:bg-white/10 focus-visible:outline-none"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-ember">{item.selected && <CheckIcon size={16} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-room-ink">{item.primary}</span>
                {item.secondary && <span className="block truncate text-[12px] text-room-ink-3">{item.secondary}</span>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

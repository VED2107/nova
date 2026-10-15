import { useEffect, useRef, type ReactNode } from "react";
import { CheckIcon } from "./icons";

export interface MenuItem {
  key: string;
  primary: string;
  secondary?: string;
  selected: boolean;
  onSelect: () => void;
}

/** Popover anchored above its trigger; scales from the bottom edge. */
export function Menu(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  sections: { title?: string; items: MenuItem[]; empty?: string }[];
  align?: "left" | "right";
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) props.onClose();
    };
    window.addEventListener("pointerdown", onDown);
    ref.current?.querySelector<HTMLButtonElement>("[aria-checked='true'], button")?.focus();
    return () => window.removeEventListener("pointerdown", onDown);
  }, [props.open]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={props.label}
      data-open={props.open}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          props.onClose();
        }
      }}
      className={[
        "absolute bottom-[calc(100%+10px)] z-20 min-w-60 max-w-80 rounded-xl border border-white/10",
        "bg-ink/92 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl",
        "origin-bottom transition-[opacity,transform] duration-150 ease-(--ease-out-strong)",
        "data-[open=false]:pointer-events-none data-[open=false]:scale-[0.97] data-[open=false]:opacity-0",
        "motion-reduce:transition-opacity",
        props.align === "right" ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left",
      ].join(" ")}
    >
      {props.children}
      {props.sections.map((section, i) => (
        <div key={i} className={i > 0 ? "mt-1 border-t border-white/8 pt-1" : ""}>
          {section.title && (
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ash">{section.title}</div>
          )}
          {section.items.length === 0 && section.empty && (
            <div className="px-2.5 py-2 text-sm text-ash">{section.empty}</div>
          )}
          {section.items.map((item) => (
            <button
              key={item.key}
              role="menuitemradio"
              aria-checked={item.selected}
              tabIndex={props.open ? 0 : -1}
              onClick={() => {
                item.onSelect();
                props.onClose();
              }}
              className="press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/8 focus-visible:bg-white/8"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-ember">
                {item.selected && <CheckIcon width={16} height={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-cream">{item.primary}</span>
                {item.secondary && <span className="block truncate text-xs text-ash">{item.secondary}</span>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

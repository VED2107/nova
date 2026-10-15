import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "paper" | "room";

/** Text button. `primary` = ember fill (one per view), `quiet` = seam outline, `ghost` = text. */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost" | "danger"; tone?: Tone; icon?: ReactNode }
>(function Button({ variant = "quiet", tone = "paper", icon, className = "", children, ...rest }, ref) {
  const room = tone === "room";
  const v = {
    primary: "bg-ember text-on-ember hover:brightness-105",
    quiet: room
      ? "border border-room-seam text-room-ink hover:bg-white/8"
      : "border border-seam-strong text-ink hover:bg-[var(--hover)]",
    ghost: room ? "text-room-ink-2 hover:text-room-ink hover:bg-white/8" : "text-ink-2 hover:text-ink hover:bg-[var(--hover)]",
    danger: room
      ? "border border-room-seam text-[#ff8a7a] hover:bg-white/8"
      : "border border-seam-strong text-danger hover:bg-[var(--hover)]",
  }[variant];
  return (
    <button
      ref={ref}
      type="button"
      className={`press inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-[13px] font-[560] disabled:pointer-events-none disabled:opacity-40 ${v} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/** Square icon button; `label` is the accessible name and the tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: Tone; active?: boolean; size?: "sm" | "md" | "lg" }
>(function IconButton({ label, tone = "paper", active, size = "md", className = "", children, ...rest }, ref) {
  const room = tone === "room";
  const dims = { sm: "size-7 rounded-[5px]", md: "size-9 rounded-[7px]", lg: "size-11 rounded-full" }[size];
  const color = active
    ? "text-ember"
    : room
      ? "text-room-ink-2 hover:text-room-ink"
      : "text-ink-2 hover:text-ink";
  const hover = room ? "hover:bg-white/10" : "hover:bg-[var(--hover)]";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`press inline-flex shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-35 ${dims} ${color} ${hover} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Accessible on/off switch (role=switch). */
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      className="group flex w-full items-start justify-between gap-6 rounded-[8px] px-3 py-3 text-left hover:bg-[var(--hover)] disabled:opacity-50"
    >
      <span>
        <span className="block text-[14px] font-[560] text-ink">{props.label}</span>
        {props.description && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{props.description}</span>}
      </span>
      <span
        aria-hidden
        className={`relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-150 ${
          props.checked ? "border-ember bg-ember" : "border-seam-strong bg-paper-sunk"
        }`}
      >
        <span
          className={`absolute top-[2px] size-[14px] rounded-full shadow-sm transition-transform duration-200 ease-(--ease-out-strong) ${
            props.checked ? "translate-x-[16px] bg-ink" : "translate-x-[2px] bg-ink-3"
          }`}
        />
      </span>
    </button>
  );
}

/** Radio group drawn as a segmented control. */
export function Segmented<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="inline-flex rounded-[8px] border border-seam-strong p-0.5">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => props.onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = props.options.findIndex((x) => x.value === props.value);
              const n = props.options[(i + (e.key === "ArrowRight" ? 1 : props.options.length - 1)) % props.options.length]!;
              props.onChange(n.value);
              (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[props.options.indexOf(n)])?.focus();
            }}
            className={`press h-7 rounded-[6px] px-3 text-[13px] font-[560] ${on ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Kbd({ children, tone = "paper" }: { children: ReactNode; tone?: Tone }) {
  return (
    <kbd
      className={`inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[4px] border px-1.5 font-sans text-[11.5px] font-[600] ${
        tone === "room" ? "border-room-seam text-room-ink-2" : "border-seam-strong bg-paper-raised text-ink-2"
      }`}
    >
      {children}
    </kbd>
  );
}

export type StampKind = "progress" | "watched" | "missing" | "new";
/** Ink-on-paper state mark. Words carry the meaning; colour only reinforces. */
export function Stamp({ kind }: { kind: StampKind }) {
  const s = {
    progress: { label: "In progress", cls: "text-ember-text" },
    watched: { label: "Watched", cls: "text-ink-3" },
    missing: { label: "Missing", cls: "text-danger" },
    new: { label: "New", cls: "text-ink-2" },
  }[kind];
  return <span className={`stamp ${s.cls}`}>{s.label}</span>;
}

import { ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon } from "../../components/icons";
import { queue, useQueue } from "../../services/playback/client";

/** Side panel listing the play queue. Every action round-trips to Rust. */
export function QueuePanel(props: { open: boolean; onClose: () => void; onAddFiles: () => void; onError: (e: unknown) => void }) {
  const q = useQueue();
  const run = (p: Promise<unknown>) => void p.catch(props.onError);
  const currentIndex = q.items.findIndex((i) => i.id === q.currentId);

  return (
    <aside
      aria-label="Queue"
      aria-hidden={!props.open}
      data-open={props.open}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          props.onClose();
        }
      }}
      className={[
        "absolute inset-y-3 right-3 z-30 flex w-80 flex-col rounded-2xl border border-white/10 bg-ink/90 shadow-2xl shadow-black/60 backdrop-blur-xl",
        "transition-[transform,opacity] duration-200 ease-(--ease-out-strong)",
        "data-[open=false]:pointer-events-none data-[open=false]:translate-x-[calc(100%+12px)] data-[open=false]:opacity-0",
        "motion-reduce:transition-opacity motion-reduce:data-[open=false]:translate-x-0",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="font-display text-lg font-semibold text-cream">Queue</h2>
        <span className="text-sm tabular-nums text-ash">{q.items.length}</span>
        <div className="flex-1" />
        <button
          type="button"
          tabIndex={props.open ? 0 : -1}
          onClick={props.onAddFiles}
          className="press flex items-center gap-1 rounded-full px-2.5 py-1 text-sm text-cream/85 hover:bg-white/10"
        >
          <PlusIcon width={16} height={16} /> Add
        </button>
        <button
          type="button"
          aria-label="Close queue"
          tabIndex={props.open ? 0 : -1}
          onClick={props.onClose}
          className="press flex size-8 items-center justify-center rounded-full text-cream/70 hover:bg-white/10"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      {q.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm text-cream/85">Nothing queued</p>
          <p className="text-xs leading-relaxed text-ash">Open several files at once, drop them here, or use Add.</p>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto px-2 pb-2">
          {q.items.map((item, i) => {
            const current = item.id === q.currentId;
            const played = currentIndex >= 0 && i < currentIndex;
            return (
              <li
                key={item.id}
                className={`group flex items-center gap-1 rounded-lg pr-1 ${current ? "bg-white/8" : "hover:bg-white/5"}`}
              >
                <button
                  type="button"
                  tabIndex={props.open ? 0 : -1}
                  aria-current={current ? "true" : undefined}
                  onClick={() => run(queue.select(item.id))}
                  title={item.path}
                  className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                >
                  <span className={`w-5 shrink-0 text-right text-xs tabular-nums ${current ? "text-ember" : "text-ash"}`}>
                    {current ? "▶" : i + 1}
                  </span>
                  <span className={`truncate text-sm ${current ? "font-medium text-cream" : played ? "text-ash" : "text-cream/85"}`}>
                    {item.title}
                  </span>
                </button>
                <div className="flex shrink-0 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  <RowButton label={`Move ${item.title} up`} disabled={i === 0} open={props.open} onClick={() => run(queue.move(item.id, i - 1))}>
                    <ChevronUpIcon width={16} height={16} />
                  </RowButton>
                  <RowButton label={`Move ${item.title} down`} disabled={i === q.items.length - 1} open={props.open} onClick={() => run(queue.move(item.id, i + 1))}>
                    <ChevronDownIcon width={16} height={16} />
                  </RowButton>
                  <RowButton label={`Remove ${item.title}`} open={props.open} onClick={() => run(queue.remove(item.id))}>
                    <CloseIcon width={16} height={16} />
                  </RowButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {q.items.length > 0 && (
        <footer className="border-t border-white/8 px-4 py-2.5">
          <button
            type="button"
            tabIndex={props.open ? 0 : -1}
            onClick={() => run(queue.clear())}
            className="press text-xs text-ash hover:text-cream"
          >
            Clear queue
          </button>
        </footer>
      )}
    </aside>
  );
}

function RowButton(props: { label: string; onClick: () => void; disabled?: boolean; open: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      tabIndex={props.open ? 0 : -1}
      onClick={props.onClick}
      className="press flex size-7 items-center justify-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream disabled:opacity-25"
    >
      {props.children}
    </button>
  );
}

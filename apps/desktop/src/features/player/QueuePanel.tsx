import { useEffect, useRef, useState } from "react";
import { CloseIcon, GripIcon, PlusIcon, SaveIcon, TrashIcon } from "../../components/icons";
import { Button, IconButton } from "../../components/ui/controls";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { library } from "../../services/library/client";
import { formatDuration } from "../../services/library/view";
import { queue, useQueue } from "../../services/playback/client";
import type { RepeatMode } from "../../services/playback/types";

/** Queue as a stack of pulled spines. Every change round-trips to Rust. */
export function QueuePanel(props: { onClose: () => void; onAddFiles: () => void; onError: (e: unknown) => void }) {
  const q = useQueue();
  const run = (p: Promise<unknown>) => void p.catch(props.onError);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [clearing, setClearing] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const currentIndex = q.items.findIndex((i) => i.id === q.currentId);

  useEffect(() => {
    const paths = q.items.map((i) => i.path);
    if (paths.length === 0) return;
    library.durations(paths).then(setDurations, () => {});
  }, [q.items]);

  useEffect(() => {
    if (saving) nameRef.current?.focus();
  }, [saving]);

  const upcomingMs = q.items.slice(currentIndex + 1).reduce((n, i) => n + (durations[i.path] ?? 0), 0);
  const unknownUpcoming = q.items.slice(currentIndex + 1).some((i) => durations[i.path] == null);
  const repeatLabel: Record<RepeatMode, string> = { off: "Repeat off", one: "Repeat one", all: "Repeat all" };
  const nextRepeat: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await library.createPlaylist(n, q.items.map((i) => ({ path: i.path, title: i.title })));
      setSaving(false);
      setName("");
      setSaved(n);
    } catch (e) {
      props.onError(e);
    }
  };

  return (
    <section aria-label="Queue" className="flex h-full flex-col">
      <header className="border-b border-room-seam px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="spine text-[22px] text-room-ink">Queue</h2>
            <p className="mt-0.5 text-[12.5px] text-room-ink-2">
              {q.items.length} {q.items.length === 1 ? "title" : "titles"}
              {upcomingMs > 0 && ` · ${unknownUpcoming ? "at least " : ""}${formatDuration(upcomingMs)} up next`}
            </p>
          </div>
          <IconButton tone="room" size="sm" label="Close queue (Q)" onClick={props.onClose}>
            <CloseIcon size={18} />
          </IconButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button tone="room" variant="quiet" onClick={props.onAddFiles} icon={<PlusIcon size={16} />}>
            Add
          </Button>
          <Button tone="room" variant="quiet" onClick={() => run(queue.setRepeat(nextRepeat[q.repeat]))} aria-label={`${repeatLabel[q.repeat]}. Change`} className={q.repeat !== "off" ? "text-ember" : ""}>
            {repeatLabel[q.repeat]}
          </Button>
          <Button tone="room" variant="quiet" onClick={() => run(queue.shuffle())} disabled={q.items.length - currentIndex - 1 < 2}>
            Shuffle upcoming
          </Button>
        </div>
      </header>

      {q.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 px-6">
          <p className="spine text-[20px] text-room-ink">Nothing queued</p>
          <p className="text-[13px] leading-relaxed text-room-ink-2">Open several files at once, drop them on the player, or add them here.</p>
        </div>
      ) : (
        <ol
          className="min-h-0 flex-1 overflow-y-auto py-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId != null && dropIndex != null) run(queue.move(dragId, dropIndex));
            setDragId(null);
            setDropIndex(null);
          }}
        >
          {q.items.map((item, i) => {
            const current = item.id === q.currentId;
            const played = currentIndex >= 0 && i < currentIndex;
            const d = formatDuration(durations[item.path]);
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDragId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1 > q.items.length - 1 ? q.items.length - 1 : i);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onKeyDown={(e) => {
                  if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                  e.preventDefault();
                  e.stopPropagation();
                  run(queue.move(item.id, Math.max(0, Math.min(q.items.length - 1, i + (e.key === "ArrowUp" ? -1 : 1)))));
                }}
                className={`group relative mx-2 flex items-center gap-2 rounded-[6px] pr-1 ${current ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"} ${dragId === item.id ? "opacity-40" : ""}`}
              >
                {dropIndex === i && dragId != null && dragId !== item.id && <span aria-hidden className="absolute inset-x-2 -top-px h-[2px] rounded-full bg-ember" />}
                <span aria-hidden className="cursor-grab pl-1 text-room-ink-3 opacity-0 group-hover:opacity-100">
                  <GripIcon size={16} />
                </span>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  aria-describedby="queue-move-hint"
                  onClick={() => run(queue.select(item.id))}
                  title={item.path}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                >
                  <span className={`w-5 shrink-0 text-right text-[12px] font-[600] tabular-nums ${current ? "text-ember" : "text-room-ink-3"}`}>
                    {current ? <span className="inline-block size-1.5 rounded-full bg-ember align-middle" /> : i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[13.5px] ${current ? "font-[650] text-room-ink" : played ? "text-room-ink-3" : "text-room-ink-2"}`}>
                    {item.title}
                  </span>
                  {d && <span className="shrink-0 text-[12px] tabular-nums text-room-ink-3">{d}</span>}
                </button>
                <IconButton tone="room" size="sm" label={`Remove ${item.title}`} onClick={() => run(queue.remove(item.id))} className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100">
                  <CloseIcon size={16} />
                </IconButton>
              </li>
            );
          })}
        </ol>
      )}
      <p id="queue-move-hint" className="sr-only">
        Alt plus up or down arrow moves the item.
      </p>

      {q.items.length > 0 && (
        <footer className="border-t border-room-seam px-5 py-3">
          {saving ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Playlist name</span>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setSaving(false);
                  }}
                  placeholder="Playlist name"
                  className="h-8 w-full rounded-[6px] border border-room-seam bg-black/30 px-2.5 text-[13px] text-room-ink placeholder:text-room-ink-3 focus:border-ember focus:outline-none"
                />
              </label>
              <Button tone="room" variant="primary" type="submit" disabled={!name.trim()}>
                Save
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Button tone="room" variant="ghost" icon={<SaveIcon size={16} />} onClick={() => setSaving(true)}>
                Save as playlist
              </Button>
              {saved && (
                <span role="status" className="truncate text-[12px] text-room-ink-2">
                  Saved “{saved}”
                </span>
              )}
              <span className="flex-1" />
              <Button tone="room" variant="danger" icon={<TrashIcon size={16} />} onClick={() => setClearing(true)}>
                Clear
              </Button>
            </div>
          )}
        </footer>
      )}

      <ConfirmDialog
        open={clearing}
        title="Clear the queue?"
        body="The list is emptied. What's playing keeps playing, and no files are touched."
        confirmLabel="Clear queue"
        onCancel={() => setClearing(false)}
        onConfirm={() => {
          setClearing(false);
          run(queue.clear());
        }}
      />
    </section>
  );
}

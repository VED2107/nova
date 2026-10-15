import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FolderIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { Thumb } from "../../components/Thumb";
import { Button, IconButton, Stamp } from "../../components/ui/controls";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { library } from "../../services/library/client";
import type { LibraryItem, PlaylistSummary, ScanRoot } from "../../services/library/types";
import { catalogNo, folderName, formatDuration, specLine, stampFor, timeLeft, watchedFraction } from "../../services/library/view";

export function HomeView(props: {
  onPlay: (item: LibraryItem) => void;
  onPlayPlaylist: (p: PlaylistSummary) => void;
  onOpenLibrary: (rootId?: number) => void;
  onOpenFile: () => void;
  onAddFolder: () => void;
}) {
  const [continueItems, setContinue] = useState<LibraryItem[] | null>(null);
  const [recent, setRecent] = useState<LibraryItem[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null);
  const [renaming, setRenaming] = useState<PlaylistSummary | null>(null);

  const load = useCallback(() => {
    const fail = (e: unknown) => setError(String(e));
    library.continueWatching(12).then(setContinue, fail);
    library.recentlyAdded(10).then(setRecent, fail);
    library.playlists().then(setPlaylists, fail);
    library.roots().then(setRoots, fail);
  }, []);

  useEffect(() => {
    load();
    const un = library.onChanged(load);
    return () => void un.then((f) => f());
  }, [load]);

  const loading = continueItems == null || recent == null;
  const empty = !loading && continueItems.length === 0 && recent.length === 0 && playlists.length === 0;
  const [lead, ...rest] = continueItems ?? [];

  const titles = roots.reduce((n, r) => n + r.itemCount, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,48px)] pb-20 pt-8">
        {error && (
          <p role="alert" className="mb-6 rounded-[8px] border border-seam-strong px-4 py-3 text-[13.5px] text-ink-2">
            The library couldn't be read: {error}
          </p>
        )}

        {empty ? (
          <Welcome onAddFolder={props.onAddFolder} onOpenFile={props.onOpenFile} />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-x-10 gap-y-8 max-[1020px]:grid-cols-1">
              <section aria-labelledby="continue-h" className="min-w-0">
                <SectionHead id="continue-h" title="Continue" />
                {loading ? (
                  <div className="mt-5 aspect-[2.6/1] animate-pulse rounded-[8px] bg-paper-sunk motion-reduce:animate-none" aria-label="Loading" />
                ) : !lead ? (
                  <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-3">
                    Nothing in progress. Stop anything partway through and it waits for you here.
                  </p>
                ) : (
                  <>
                    <LeadFeature item={lead} onPlay={props.onPlay} />
                    {rest.length > 0 && (
                      <ul aria-label="Also in progress" className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-5">
                        {rest.slice(0, 4).map((item) => (
                          <li key={item.id}>
                            <PosterCard item={item} onPlay={props.onPlay} showLeft />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>

              <ShelfAside roots={roots} titles={titles} onOpen={props.onOpenLibrary} onAdd={props.onAddFolder} />
            </div>

            {recent && recent.length > 0 && (
              <section aria-labelledby="recent-h" className="mt-14">
                <SectionHead
                  id="recent-h"
                  title="Recently added"
                  action={
                    <button type="button" onClick={() => props.onOpenLibrary()} className="text-[13px] font-[600] text-ember-text underline-offset-4 hover:underline">
                      Whole library
                    </button>
                  }
                />
                <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-6">
                  {recent.map((item) => (
                    <li key={item.id}>
                      <PosterCard item={item} onPlay={props.onPlay} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="pl-h" className="mt-14">
              <SectionHead id="pl-h" title="Playlists" />
              {playlists.length === 0 ? (
                <p className="mt-4 text-[13.5px] text-ink-3">Queue a few titles in the player and choose “Save as playlist” to keep them here.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-5 gap-y-2">
                  {playlists.map((p) => (
                    <li key={p.id} className="group flex items-center gap-2 border-b border-seam py-2">
                      <button
                        type="button"
                        onClick={() => props.onPlayPlaylist(p)}
                        className="press flex min-w-0 flex-1 items-center gap-3 rounded-[6px] px-1 py-1 text-left hover:bg-[var(--hover)]"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
                          <PlayIcon size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="spine block truncate text-[18px] text-ink">{p.name}</span>
                          <span className="block text-[12.5px] text-ink-3">
                            {p.itemCount} {p.itemCount === 1 ? "file" : "files"}
                            {p.knownDurationMs ? ` · ${formatDuration(p.knownDurationMs)}` : ""}
                          </span>
                        </span>
                      </button>
                      <span className="flex gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                        <IconButton label={`Rename playlist ${p.name}`} size="sm" onClick={() => setRenaming(p)}>
                          <PencilIcon size={16} />
                        </IconButton>
                        <IconButton label={`Delete playlist ${p.name}`} size="sm" onClick={() => setDeleting(p)}>
                          <TrashIcon size={16} />
                        </IconButton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <RenamePlaylist
        playlist={renaming}
        onClose={() => setRenaming(null)}
        onSave={(name) => library.renamePlaylist(renaming!.id, name).then(() => (setRenaming(null), load()))}
      />

      <ConfirmDialog
        open={deleting != null}
        title="Delete playlist?"
        body={
          <>
            “{deleting?.name}” will be removed. The files themselves are not touched.
          </>
        }
        confirmLabel="Delete playlist"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) library.deletePlaylist(deleting.id).then(load, (e) => setError(String(e)));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function SectionHead({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
      <h2 id={id} className="spine text-[28px] text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

/** Rename keeps the dialog open on failure so the message can be read and fixed. */
function RenamePlaylist(props: { playlist: PlaylistSummary | null; onClose: () => void; onSave: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setName(props.playlist?.name ?? "");
    setErr(null);
  }, [props.playlist]);
  const trimmed = name.trim();
  return (
    <Dialog open={props.playlist != null} onClose={props.onClose} title="Rename playlist" width="min(400px, calc(100vw - 48px))">
      <form
        className="px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) props.onSave(trimmed).catch((x) => setErr(String(x)));
        }}
      >
        <label className="block text-[13px] text-ink-2">
          Name
          <input
            data-autofocus
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.currentTarget.value)}
            aria-invalid={err != null}
            className="mt-1.5 h-10 w-full rounded-[8px] border border-seam-strong bg-paper-raised px-3 text-[15px] text-ink focus:border-ember focus:outline-none"
          />
        </label>
        <p className="mt-2 min-h-4 text-[12.5px] text-danger" role="alert">
          {err}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!trimmed || trimmed === props.playlist?.name}>
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The title you were watching: artwork and its facts side by side, so the band stays compact with one item or many. */
function LeadFeature({ item, onPlay }: { item: LibraryItem; onPlay: (i: LibraryItem) => void }) {
  const frac = watchedFraction(item.progress);
  const left = timeLeft(item.progress);
  const stamp = stampFor(item);
  return (
    <article aria-label={item.title} className="mt-5 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-end gap-x-7 gap-y-4 max-[760px]:grid-cols-1">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => onPlay(item)}
        disabled={item.missing}
        className="press group relative block w-full overflow-hidden rounded-[8px] text-left disabled:cursor-not-allowed"
      >
        <Thumb item={item} progress={frac} className="aspect-video w-full rounded-[8px] ring-1 ring-seam" />
        {!item.missing && (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-[opacity,background-color] duration-200 group-hover:bg-black/25 group-hover:opacity-100">
            <span className="flex size-14 items-center justify-center rounded-full bg-cream text-[#171715] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]">
              <PlayIcon size={22} />
            </span>
          </span>
        )}
      </button>
      <div className="min-w-0 pb-1">
        <div className="flex items-center gap-2">
          <span className="catalog text-ink-3">{catalogNo(item.id)}</span>
          {stamp && <Stamp kind={stamp} />}
        </div>
        <h3 className="spine-xl mt-2 line-clamp-3 text-[clamp(28px,3vw,40px)] text-ink [text-wrap:balance]">{item.title}</h3>
        <p className="mt-2 text-[13px] text-ink-3">{[specLine(item), folderName(item.folder)].filter(Boolean).join(" · ")}</p>
        {frac != null && (
          <div className="mt-5 flex items-center gap-3">
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--seam-strong)]" aria-hidden>
              <span className="block h-full rounded-full bg-ember" style={{ width: `${Math.max(2, frac * 100)}%` }} />
            </span>
            {left && <span className="shrink-0 text-[13px] font-[560] tabular-nums text-ink-2">{left}</span>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => onPlay(item)} disabled={item.missing} icon={<PlayIcon size={14} />} className="h-10 px-4 text-[14px]">
            Resume
          </Button>
          {item.missing && <span className="text-[13px] text-danger">The file was moved or deleted.</span>}
        </div>
      </div>
    </article>
  );
}

/** A title as a frame on the shelf: artwork first, then the facts NOVA actually has. */
function PosterCard({ item, onPlay, showLeft }: { item: LibraryItem; onPlay: (i: LibraryItem) => void; showLeft?: boolean }) {
  const stamp = stampFor(item);
  const sub = showLeft ? (timeLeft(item.progress) ?? specLine(item)) : specLine(item);
  return (
    <button type="button" onClick={() => onPlay(item)} disabled={item.missing} title={item.path} className="press group block w-full rounded-[8px] text-left disabled:cursor-not-allowed">
      <span className="relative block">
        <Thumb
          item={item}
          progress={watchedFraction(item.progress)}
          className={`aspect-video w-full rounded-[6px] ring-1 ring-seam transition-[box-shadow] duration-200 group-hover:ring-[var(--seam-strong)] ${item.missing ? "opacity-50 grayscale" : ""}`}
        />
        {stamp && stamp !== "progress" && (
          <span className="absolute left-2 top-2 rounded-[3px] bg-paper px-0.5">
            <Stamp kind={stamp} />
          </span>
        )}
      </span>
      <span className="mt-2.5 flex items-baseline gap-2">
        <span className="spine min-w-0 flex-1 truncate text-[17px] text-ink">{item.title}</span>
        <span className="catalog shrink-0 text-ink-3">{catalogNo(item.id)}</span>
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{sub}</span>
    </button>
  );
}

/** What is on this computer, and the ways to add to it. Real counts only. */
function ShelfAside(props: { roots: ScanRoot[]; titles: number; onOpen: (rootId?: number) => void; onAdd: () => void }) {
  return (
    <aside aria-labelledby="shelf-h" className="min-w-0 self-start rounded-[10px] bg-paper-sunk p-5 max-[1020px]:order-first max-[1020px]:p-4">
      <h2 id="shelf-h" className="spine text-[22px] text-ink">
        Your shelf
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-3">
        {props.titles.toLocaleString()} {props.titles === 1 ? "title" : "titles"} in {props.roots.length} {props.roots.length === 1 ? "folder" : "folders"}, on this
        computer only
      </p>
      {props.roots.length > 0 && (
        <ul className="mt-4 flex flex-col gap-0.5 max-[1020px]:flex-row max-[1020px]:flex-wrap">
          {props.roots.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => props.onOpen(r.id)}
                title={r.path}
                className="press flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-[var(--hover)]"
              >
                <FolderIcon size={16} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-[600] text-ink">{folderName(r.path)}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{r.itemCount.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-seam pt-4">
        <Button onClick={props.onAdd} icon={<PlusIcon size={16} />}>
          Add folder
        </Button>
        <Button variant="ghost" onClick={() => props.onOpen()}>
          Browse library
        </Button>
      </div>
    </aside>
  );
}

const PROMISES: [string, string][] = [
  ["Remembers where you stopped", "Close a film halfway and it opens there next time, even after a restart."],
  ["Tells you what is in a file", "Codec, resolution, bit depth, HDR and decoder, one key away."],
  ["Stays on this computer", "No account and no tracking. The library is a file on this PC."],
];

/** First launch: what NOVA is for, two ways in, and the promises it keeps. */
function Welcome({ onAddFolder, onOpenFile }: { onAddFolder: () => void; onOpenFile: () => void }) {
  return (
    <section className="grid min-h-[min(640px,calc(100vh-140px))] grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-12 max-[900px]:grid-cols-1">
      <div className="max-w-xl">
        <h2 className="spine-xl text-[clamp(44px,6vw,76px)] text-ink [text-wrap:balance]">An empty shelf, ready for your films</h2>
        <p className="mt-5 max-w-[56ch] text-[15.5px] leading-relaxed text-ink-2">
          Add the folders where you keep films, recordings and music, or open a single file. You can also drop files anywhere in this window.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onAddFolder} icon={<FolderIcon size={16} />} className="h-10 px-4 text-[14px]">
            Add a folder
          </Button>
          <Button onClick={onOpenFile} className="h-10 px-4 text-[14px]">
            Open a file
          </Button>
        </div>
      </div>
      <dl className="divide-y divide-seam border-y border-seam">
        {PROMISES.map(([t, d]) => (
          <div key={t} className="py-4">
            <dt className="spine text-[19px] text-ink">{t}</dt>
            <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

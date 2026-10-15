import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-10 pb-16 pt-9">
          {error && (
            <p role="alert" className="mb-6 rounded-[8px] border border-seam-strong px-4 py-3 text-[13.5px] text-ink-2">
              The library couldn't be read: {error}
            </p>
          )}

          {empty ? (
            <EmptyShelf onAddFolder={props.onAddFolder} onOpenFile={props.onOpenFile} />
          ) : (
            <>
              <section aria-labelledby="continue-h">
                <h2 id="continue-h" className="spine-xl text-[44px] text-ink">
                  Continue
                </h2>
                {loading ? (
                  <div className="mt-6 h-[260px] animate-pulse rounded-[6px] bg-paper-sunk motion-reduce:animate-none" aria-label="Loading" />
                ) : !lead ? (
                  <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-3">
                    Nothing in progress. Stop anything partway through and it waits for you here.
                  </p>
                ) : (
                  <div className="mt-6 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-x-8 gap-y-6 max-[900px]:grid-cols-1">
                    <LeadSpine item={lead} onPlay={props.onPlay} />
                    {rest.length > 0 && (
                      <ul className="flex flex-col divide-y divide-seam border-y border-seam" aria-label="Also in progress">
                        {rest.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            <ShelfRow item={item} onPlay={props.onPlay} showLeft />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              {recent && recent.length > 0 && (
                <section aria-labelledby="recent-h" className="mt-14">
                  <div className="flex items-baseline justify-between border-b border-ink pb-2">
                    <h2 id="recent-h" className="spine text-[26px] text-ink">
                      Recently added
                    </h2>
                    <button type="button" onClick={() => props.onOpenLibrary()} className="text-[13px] font-[560] text-ember-text hover:underline">
                      Whole library
                    </button>
                  </div>
                  <ul className="divide-y divide-seam">
                    {recent.map((item) => (
                      <li key={item.id}>
                        <ShelfRow item={item} onPlay={props.onPlay} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="pl-h" className="mt-14">
                <div className="flex items-baseline justify-between border-b border-ink pb-2">
                  <h2 id="pl-h" className="spine text-[26px] text-ink">
                    Playlists
                  </h2>
                </div>
                {playlists.length === 0 ? (
                  <p className="mt-3 text-[13.5px] text-ink-3">Save a queue from the player to keep it here.</p>
                ) : (
                  <ul className="divide-y divide-seam">
                    {playlists.map((p) => (
                      <li key={p.id} className="group flex items-center gap-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => props.onPlayPlaylist(p)}
                          className="press flex min-w-0 flex-1 items-center gap-4 rounded-[6px] px-1 py-1 text-left hover:bg-[var(--hover)]"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-seam-strong text-ink">
                            <PlayIcon size={14} />
                          </span>
                          <span className="min-w-0">
                            <span className="spine block truncate text-[18px] text-ink">{p.name}</span>
                            <span className="block text-[12.5px] text-ink-3">
                              {p.itemCount} {p.itemCount === 1 ? "file" : "files"}
                              {p.knownDurationMs ? ` · ${formatDuration(p.knownDurationMs)} known` : ""}
                            </span>
                          </span>
                        </button>
                        <span className="ml-6 flex gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
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
      </div>

      <FolderRail roots={roots} onOpen={props.onOpenLibrary} onAdd={props.onAddFolder} />

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

function LeadSpine({ item, onPlay }: { item: LibraryItem; onPlay: (i: LibraryItem) => void }) {
  const frac = watchedFraction(item.progress);
  const left = timeLeft(item.progress);
  return (
    <article className="min-w-0" aria-label={item.title}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => onPlay(item)}
        disabled={item.missing}
        className="press group block w-full text-left disabled:cursor-not-allowed"
      >
        <Thumb item={item} progress={frac} className="aspect-video w-full rounded-[4px] ring-1 ring-seam" />
      </button>
      <div className="mt-3 flex items-center gap-2">
        <span className="catalog text-ink-3">{catalogNo(item.id)}</span>
        {stampFor(item) && <Stamp kind={stampFor(item)!} />}
      </div>
      <h3 className="spine mt-1.5 line-clamp-2 text-[30px] text-ink">{item.title}</h3>
      <p className="mt-1 text-[13px] text-ink-3">{[specLine(item), folderName(item.folder)].filter(Boolean).join(" · ")}</p>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={() => onPlay(item)} disabled={item.missing} icon={<PlayIcon size={14} />}>
          Resume
        </Button>
        {left && <span className="text-[13px] text-ink-2">{left}</span>}
        {item.missing && <span className="text-[13px] text-danger">The file was moved or deleted.</span>}
      </div>
    </article>
  );
}

function ShelfRow({ item, onPlay, showLeft }: { item: LibraryItem; onPlay: (i: LibraryItem) => void; showLeft?: boolean }) {
  const stamp = stampFor(item);
  return (
    <button
      type="button"
      onClick={() => onPlay(item)}
      disabled={item.missing}
      title={item.path}
      className="press flex w-full items-center gap-4 rounded-[4px] py-2.5 pr-2 text-left hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Thumb item={item} progress={showLeft ? watchedFraction(item.progress) : null} className="aspect-video w-[104px] shrink-0 rounded-[3px] ring-1 ring-seam" />
      <span className="min-w-0 flex-1">
        <span className="spine block truncate text-[17px] text-ink">{item.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
          {showLeft ? (timeLeft(item.progress) ?? specLine(item)) : [specLine(item), folderName(item.folder)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {stamp && !showLeft && <Stamp kind={stamp} />}
      <span className="catalog hidden w-16 shrink-0 text-right text-ink-3 min-[700px]:block">{catalogNo(item.id)}</span>
    </button>
  );
}

/** Stepped tab rail: library folders as tabs down the right edge. */
function FolderRail({ roots, onOpen, onAdd }: { roots: ScanRoot[]; onOpen: (rootId?: number) => void; onAdd: () => void }) {
  return (
    <nav aria-label="Library folders" className="flex w-[196px] shrink-0 flex-col border-l border-seam bg-paper-sunk/60 py-9 pl-4 pr-0 max-[820px]:hidden">
      <span className="catalog mb-2 px-2 text-ink-3">Folders</span>
      <ul className="flex flex-col gap-1">
        {roots.map((r, i) => (
          <li key={r.id} style={{ marginLeft: Math.min(i, 4) * 6 }}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              title={r.path}
              className="press flex w-full items-center gap-2 rounded-l-[6px] border border-r-0 border-seam bg-paper px-3 py-2 text-left hover:border-seam-strong"
            >
              <FolderIcon size={16} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-[600] text-ink">{folderName(r.path)}</span>
                <span className="block text-[11.5px] text-ink-3">
                  {r.itemCount.toLocaleString()} {r.itemCount === 1 ? "title" : "titles"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAdd} className="press mx-2 mt-3 flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[13px] font-[560] text-ink-2 hover:bg-[var(--hover)] hover:text-ink">
        <PlusIcon size={16} /> Add folder
      </button>
    </nav>
  );
}

function EmptyShelf({ onAddFolder, onOpenFile }: { onAddFolder: () => void; onOpenFile: () => void }) {
  return (
    <section className="mt-6 max-w-xl">
      <h2 className="spine-xl text-[56px] text-ink">An empty shelf</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
        Add the folders where you keep films, recordings and music. NOVA catalogues them on this computer only, remembers where you stopped, and
        tells you exactly what each file contains.
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={onAddFolder} icon={<FolderIcon size={16} />}>
          Add a folder
        </Button>
        <Button onClick={onOpenFile}>Open a file</Button>
      </div>
    </section>
  );
}

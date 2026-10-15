import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { library } from "../../services/library/client";
import type { LibraryItem, LibrarySort, ScanProgress, ScanRoot } from "../../services/library/types";
import { pagesFor, visibleRange } from "../../services/library/view";
import { ItemRow, ROW_HEIGHT } from "./ItemRow";

const PAGE = 100;
const SEARCH_DEBOUNCE_MS = 120;

export function LibraryView({ onPlay }: { onPlay: (item: LibraryItem) => void }) {
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("relevance");
  const [includeMissing, setIncludeMissing] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState<Map<number, LibraryItem[]>>(new Map());
  const [range, setRange] = useState({ start: 0, end: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const loading = useRef(new Set<number>());

  const fail = (e: unknown) => setError(String(e));
  const loadRoots = useCallback(() => library.roots().then(setRoots, fail), []);

  // A new query/sort starts a new generation; late responses from older ones are dropped.
  const reset = useCallback(() => {
    const gen = ++generation.current;
    loading.current.clear();
    library.search(query, sort, includeMissing, 0, PAGE).then((page) => {
      if (gen !== generation.current) return;
      setTotal(page.total);
      setPages(new Map([[0, page.items]]));
      if (listRef.current) listRef.current.scrollTop = 0;
    }, fail);
  }, [query, sort, includeMissing]);

  useEffect(() => {
    const t = window.setTimeout(reset, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [reset]);

  useEffect(() => {
    loadRoots();
    library.scanStatus().then((s) => setScan(s.current), () => {});
    const unScan = library.onScan(setScan);
    const unChanged = library.onChanged(() => {
      loadRoots();
      reset();
    });
    searchRef.current?.focus();
    return () => {
      void unScan.then((f) => f());
      void unChanged.then((f) => f());
    };
  }, [loadRoots, reset]);

  // Fetch pages for the visible rows.
  useEffect(() => {
    const gen = generation.current;
    for (const p of pagesFor(range.start, range.end, PAGE)) {
      if (pages.has(p) || loading.current.has(p)) continue;
      loading.current.add(p);
      library.search(query, sort, includeMissing, p * PAGE, PAGE).then((page) => {
        if (gen !== generation.current) return;
        setPages((prev) => new Map(prev).set(p, page.items));
      }, fail);
    }
  }, [range, pages, query, sort, includeMissing]);

  const measure = useCallback(() => {
    const el = listRef.current;
    if (el) setRange(visibleRange(el.scrollTop, el.clientHeight, ROW_HEIGHT, total ?? 0));
  }, [total]);
  useEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // "/" focuses search (when not already typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addFolder = async () => {
    setError(null);
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") await library.addRoot(picked).then(loadRoots, fail);
  };

  const scanning = scan?.state === "scanning";
  const rows: { index: number; item: LibraryItem }[] = [];
  for (let i = range.start; i < range.end; i++) {
    const item = pages.get(Math.floor(i / PAGE))?.[i % PAGE];
    if (item) rows.push({ index: i, item });
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl gap-8 px-8 pb-6 pt-6">
      <aside className="flex w-64 shrink-0 flex-col gap-3" aria-label="Library folders">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Folders</h2>
          <button type="button" onClick={addFolder} className="press rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-cream">
            Add folder
          </button>
        </div>
        {roots.length === 0 && <p className="text-sm leading-relaxed text-ash">No folders yet. Add one to start building your library.</p>}
        <ul className="flex flex-col gap-2">
          {roots.map((r) => (
            <RootCard
              key={r.id}
              root={r}
              live={scan?.rootId === r.id ? scan : null}
              onRescan={() => library.rescan([r.id]).catch(fail)}
              onRemove={() => library.removeRoot(r.id).then(loadRoots, fail)}
            />
          ))}
        </ul>
        {roots.length > 1 && (
          <button type="button" onClick={() => library.rescan().catch(fail)} disabled={scanning} className="self-start text-xs font-medium text-ember hover:underline disabled:opacity-40">
            Rescan all
          </button>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Library items">
        {error && (
          <p role="alert" className="mb-3 flex items-center justify-between rounded-lg bg-ember/10 px-4 py-2.5 text-sm text-ink">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-4 text-xs font-medium text-ash hover:text-ink">Dismiss</button>
          </p>
        )}
        {scanning && scan && (
          <div role="status" className="mb-3 flex items-center gap-3 rounded-lg border border-ink/10 bg-white/60 px-4 py-2.5 text-sm">
            <span className="size-2 animate-pulse rounded-full bg-ember motion-reduce:animate-none" aria-hidden />
            <span className="flex-1 text-ink">
              Scanning… <span className="tabular-nums">{scan.filesSeen.toLocaleString()}</span> files
              {scan.filesAdded > 0 && <span className="text-ash"> · {scan.filesAdded.toLocaleString()} new</span>}
            </span>
            <button type="button" onClick={() => library.cancelScans().catch(fail)} className="press rounded-full border border-ink/15 px-3 py-1 text-xs font-medium hover:bg-ink/5">
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Search library</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search titles and folders  ( / )"
              className="w-full rounded-xl border border-ink/12 bg-white/70 px-4 py-2.5 text-[15px] text-ink placeholder:text-ash focus:border-ember focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ash">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.currentTarget.value as LibrarySort)}
              className="rounded-lg border border-ink/12 bg-white/70 px-2 py-2 text-sm text-ink"
            >
              <option value="relevance">{query.trim() ? "Best match" : "Title"}</option>
              <option value="title">Title</option>
              <option value="added">Recently added</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ash">
            <input type="checkbox" checked={includeMissing} onChange={(e) => setIncludeMissing(e.currentTarget.checked)} className="accent-ember" />
            Show missing
          </label>
        </div>

        <p className="mb-1 mt-3 px-3 text-xs text-ash" aria-live="polite">
          {total == null ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "item" : "items"}`}
        </p>

        <div ref={listRef} onScroll={measure} className="relative min-h-0 flex-1 overflow-y-auto" role="list">
          {total === 0 ? (
            <div className="px-3 py-10 text-sm text-ash">
              {query.trim() ? `No matches for “${query.trim()}”.` : roots.length ? "No media found yet. Scans add items as they find them." : "Add a folder to see your media here."}
            </div>
          ) : (
            <div style={{ height: (total ?? 0) * ROW_HEIGHT }} className="relative">
              {rows.map(({ index, item }) => (
                <div role="listitem" key={item.id}>
                  <ItemRow item={item} onPlay={onPlay} style={{ top: index * ROW_HEIGHT }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RootCard(props: { root: ScanRoot; live: ScanProgress | null; onRescan: () => void; onRemove: () => void }) {
  const { root, live } = props;
  const [confirming, setConfirming] = useState(false);
  const last = root.lastScan;
  const status = live?.state === "scanning"
    ? `Scanning · ${live.filesSeen.toLocaleString()} files`
    : last == null
      ? "Not scanned yet"
      : last.status === "completed"
        ? `${root.itemCount.toLocaleString()} items${root.missingCount ? ` · ${root.missingCount} missing` : ""}`
        : last.status === "failed"
          ? "Folder not reachable — check the drive"
          : last.status === "interrupted"
            ? "Last scan was interrupted — rescan"
            : last.status === "cancelled"
              ? "Last scan cancelled"
              : "Scanning";
  return (
    <li className="rounded-xl border border-ink/10 bg-white/55 p-3">
      <p className="truncate text-sm font-medium text-ink" title={root.path}>{root.path.split(/[\\/]/).filter(Boolean).pop()}</p>
      <p className="truncate text-[11px] text-ash" title={root.path}>{root.path}</p>
      <p className={`mt-1.5 text-xs ${last?.status === "failed" ? "text-ember" : "text-ash"}`}>
        {status}
        {last && last.errors > 0 && live?.state !== "scanning" ? ` · ${last.errors} unreadable` : ""}
      </p>
      <div className="mt-2 flex gap-3 text-xs font-medium">
        <button type="button" onClick={props.onRescan} disabled={live?.state === "scanning"} className="text-ink hover:text-ember disabled:opacity-40">
          Rescan
        </button>
        {confirming ? (
          <>
            <button type="button" onClick={props.onRemove} className="text-ember">Remove from library</button>
            <button type="button" onClick={() => setConfirming(false)} className="text-ash hover:text-ink">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-ash hover:text-ink" title="Files on disk and watch progress are kept">
            Remove…
          </button>
        )}
      </div>
    </li>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from "../../components/icons";
import { Button, IconButton, Segmented, Switch } from "../../components/ui/controls";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { library } from "../../services/library/client";
import type { LibraryItem, LibrarySort, ScanProgress, ScanRoot } from "../../services/library/types";
import { folderName, pagesFor, visibleRange } from "../../services/library/view";
import { ItemRow, ROW_HEIGHT } from "./ItemRow";

const PAGE = 100;
const SEARCH_DEBOUNCE_MS = 120;

export function LibraryView(props: { onPlay: (item: LibraryItem) => void; onAddFolder: () => void; rootId?: number | null; onRootChange?: (id: number | null) => void }) {
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("relevance");
  const [includeMissing, setIncludeMissing] = useState(false);
  const [rootId, setRootIdState] = useState<number | null>(props.rootId ?? null);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState<Map<number, LibraryItem[]>>(new Map());
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [removing, setRemoving] = useState<ScanRoot | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const loading = useRef(new Set<number>());

  const setRootId = (id: number | null) => {
    setRootIdState(id);
    props.onRootChange?.(id);
  };
  useEffect(() => setRootIdState(props.rootId ?? null), [props.rootId]);

  const fail = (e: unknown) => setError(String(e));
  const loadRoots = useCallback(() => library.roots().then(setRoots, fail), []);

  // A new query/sort/folder starts a new generation; late responses from older ones are dropped.
  const reset = useCallback(() => {
    const gen = ++generation.current;
    loading.current.clear();
    library.search(query, sort, includeMissing, 0, PAGE, rootId).then((page) => {
      if (gen !== generation.current) return;
      setTotal(page.total);
      setPages(new Map([[0, page.items]]));
      if (listRef.current) listRef.current.scrollTop = 0;
    }, fail);
  }, [query, sort, includeMissing, rootId]);

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

  useEffect(() => {
    const gen = generation.current;
    for (const p of pagesFor(range.start, range.end, PAGE)) {
      if (pages.has(p) || loading.current.has(p)) continue;
      loading.current.add(p);
      library.search(query, sort, includeMissing, p * PAGE, PAGE, rootId).then((page) => {
        if (gen !== generation.current) return;
        setPages((prev) => new Map(prev).set(p, page.items));
      }, fail);
    }
  }, [range, pages, query, sort, includeMissing, rootId]);

  const measure = useCallback(() => {
    const el = listRef.current;
    if (el) setRange(visibleRange(el.scrollTop, el.clientHeight, ROW_HEIGHT, total ?? 0));
  }, [total]);
  useEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "f")) && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scanning = scan?.state === "scanning";
  const rows: { index: number; item: LibraryItem }[] = [];
  for (let i = range.start; i < range.end; i++) {
    const item = pages.get(Math.floor(i / PAGE))?.[i % PAGE];
    if (item) rows.push({ index: i, item });
  }
  const current = roots.find((r) => r.id === rootId) ?? null;

  return (
    <div className="flex h-full">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-seam bg-paper-sunk/60" aria-label="Library folders">
        <div className="flex items-center justify-between px-4 pb-2 pt-6">
          <h2 className="spine text-[22px] text-ink">Folders</h2>
          <IconButton label="Add folder" size="sm" onClick={props.onAddFolder}>
            <PlusIcon size={18} />
          </IconButton>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <FolderTab active={rootId == null} onClick={() => setRootId(null)} title="All folders" meta={roots.reduce((n, r) => n + r.itemCount, 0)} />
          {roots.map((r) => (
            <FolderTab key={r.id} active={rootId === r.id} onClick={() => setRootId(r.id)} title={folderName(r.path)} meta={r.itemCount} path={r.path} root={r} live={scan?.rootId === r.id ? scan : null} />
          ))}
          {roots.length === 0 && <p className="px-2 py-3 text-[13px] leading-relaxed text-ink-3">No folders yet. Add one and NOVA catalogues it in the background.</p>}
        </nav>
        {current && (
          <div className="flex gap-1 border-t border-seam px-3 py-2.5">
            <Button variant="ghost" onClick={() => library.rescan([current.id]).catch(fail)} disabled={scanning} icon={<RefreshIcon size={16} />}>
              Rescan
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" className="text-danger" onClick={() => setRemoving(current)} icon={<TrashIcon size={16} />}>
              Remove
            </Button>
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col px-8 pt-6" aria-label="Library items">
        <div className="flex items-end justify-between gap-6">
          <h2 className="spine-xl truncate text-[40px] text-ink">{current ? folderName(current.path) : "Library"}</h2>
          <p className="shrink-0 pb-1.5 text-[13px] text-ink-3" aria-live="polite">
            {total == null ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "title" : "titles"}`}
          </p>
        </div>

        {scanning && scan && (
          <div role="status" className="mt-3 flex items-center gap-3 border-y border-seam py-2 text-[13px]">
            <span className="size-2 animate-pulse rounded-full bg-ember motion-reduce:animate-none" aria-hidden />
            <span className="flex-1 text-ink-2">
              Cataloguing {folderName(roots.find((r) => r.id === scan.rootId)?.path ?? "")} · <span className="tabular-nums">{scan.filesSeen.toLocaleString()}</span> files
              {scan.filesAdded > 0 && <> · {scan.filesAdded.toLocaleString()} new</>}
            </span>
            <Button onClick={() => library.cancelScans().catch(fail)}>Cancel</Button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 flex items-center justify-between border-y border-seam py-2 text-[13px] text-ink-2">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-4 text-[12.5px] font-[560] text-ink-3 hover:text-ink">
              Dismiss
            </button>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search library</span>
            <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search titles and folders"
              className="h-10 w-full rounded-[8px] border border-seam-strong bg-paper-raised pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-ember focus:outline-none"
            />
          </label>
          <Segmented
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "relevance", label: query.trim() ? "Best match" : "A–Z" },
              { value: "added", label: "Newest" },
            ]}
          />
          <div className="w-[190px]">
            <Switch label="Show missing" checked={includeMissing} onChange={setIncludeMissing} />
          </div>
        </div>

        <div ref={listRef} onScroll={measure} className="relative mt-3 min-h-0 flex-1 overflow-y-auto border-t border-ink" role="list">
          {total === 0 ? (
            <div className="max-w-md py-10 text-[14px] leading-relaxed text-ink-3">
              {query.trim()
                ? `No titles match “${query.trim()}”. Search looks at file names and folder names.`
                : roots.length
                  ? "No media found here yet. Scans add titles as they find them."
                  : "Add a folder to start your catalogue."}
              {!roots.length && (
                <div className="mt-4">
                  <Button variant="primary" onClick={props.onAddFolder} icon={<FolderIcon size={16} />}>
                    Add a folder
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: (total ?? 0) * ROW_HEIGHT }} className="relative">
              {rows.map(({ index, item }) => (
                <div role="listitem" key={item.id}>
                  <ItemRow item={item} onPlay={props.onPlay} style={{ top: index * ROW_HEIGHT }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={removing != null}
        title="Remove folder from library?"
        body={
          <>
            <span className="font-[600] text-ink">{removing?.path}</span> will no longer be catalogued. Files on disk and watch progress are kept.
          </>
        }
        confirmLabel="Remove folder"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const r = removing;
          setRemoving(null);
          if (r) {
            if (rootId === r.id) setRootId(null);
            library.removeRoot(r.id).then(loadRoots, fail);
          }
        }}
      />
    </div>
  );
}

function FolderTab(props: { active: boolean; onClick: () => void; title: string; meta: number; path?: string; root?: ScanRoot; live?: ScanProgress | null }) {
  const last = props.root?.lastScan;
  const status =
    props.live?.state === "scanning"
      ? `Cataloguing · ${props.live.filesSeen.toLocaleString()}`
      : last?.status === "failed"
        ? "Not reachable — check the drive"
        : last?.status === "interrupted"
          ? "Scan interrupted — rescan"
          : props.root && !last
            ? "Waiting to scan"
            : `${props.meta.toLocaleString()} ${props.meta === 1 ? "title" : "titles"}${props.root?.missingCount ? ` · ${props.root.missingCount} missing` : ""}`;
  return (
    <button
      type="button"
      aria-current={props.active ? "true" : undefined}
      onClick={props.onClick}
      title={props.path}
      className={`press relative mb-0.5 flex w-full flex-col rounded-[6px] px-3 py-2 text-left ${props.active ? "bg-paper text-ink shadow-[inset_0_0_0_1px_var(--seam-strong)]" : "text-ink-2 hover:bg-[var(--hover)]"}`}
    >
      <span className="flex items-center gap-1.5 truncate text-[13.5px] font-[600]">
        {props.active && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ember" />}
        {props.title}
      </span>
      <span className={`truncate text-[12px] ${last?.status === "failed" ? "text-danger" : "text-ink-3"}`}>{status}</span>
    </button>
  );
}

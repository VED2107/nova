import { useCallback, useEffect, useState } from "react";
import { library } from "../../services/library/client";
import type { LibraryItem } from "../../services/library/types";
import { folderName, timeLeft, watchedFraction } from "../../services/library/view";

export function HomeView(props: { onPlay: (item: LibraryItem) => void; onOpenLibrary: () => void; onOpenFile: () => void }) {
  const [continueItems, setContinue] = useState<LibraryItem[] | null>(null);
  const [recent, setRecent] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    library.continueWatching(12).then(setContinue, (e) => setError(String(e)));
    library.recentlyAdded(12).then(setRecent, (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
    const un = library.onChanged(load);
    return () => void un.then((f) => f());
  }, [load]);

  const empty = continueItems?.length === 0 && recent?.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-8 pb-16 pt-8">
      {error && <p role="alert" className="mb-6 rounded-lg bg-ember/10 px-4 py-3 text-sm text-ink">{error}</p>}

      {empty ? (
        <section className="mt-16 flex flex-col items-start gap-4">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Your library is empty</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-ash">
            Add the folders where you keep videos and music. NOVA indexes them on this computer only.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={props.onOpenLibrary} className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream">
              Add a folder
            </button>
            <button type="button" onClick={props.onOpenFile} className="press rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5">
              Open a file
            </button>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="font-display text-xl font-semibold text-ink">Continue watching</h2>
            {continueItems && continueItems.length === 0 ? (
              <p className="mt-3 text-sm text-ash">Nothing in progress. Anything you stop partway through shows up here.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                {(continueItems ?? []).map((item) => (
                  <li key={item.id}>
                    <ContinueCard item={item} onPlay={props.onPlay} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-heading" className="mt-12">
            <div className="flex items-baseline justify-between">
              <h2 id="recent-heading" className="font-display text-xl font-semibold text-ink">Recently added</h2>
              <button type="button" onClick={props.onOpenLibrary} className="text-sm font-medium text-ember hover:underline">
                Open library
              </button>
            </div>
            <ul className="mt-3 divide-y divide-ink/[0.07]">
              {(recent ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => props.onPlay(item)}
                    title={item.path}
                    className="press flex w-full items-center justify-between gap-4 rounded-md px-2 py-2.5 text-left hover:bg-ink/[0.04]"
                  >
                    <span className="truncate text-[15px] text-ink">{item.title}</span>
                    <span className="shrink-0 text-xs text-ash">{folderName(item.folder)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ContinueCard({ item, onPlay }: { item: LibraryItem; onPlay: (i: LibraryItem) => void }) {
  const frac = watchedFraction(item.progress) ?? 0;
  return (
    <button
      type="button"
      onClick={() => onPlay(item)}
      disabled={item.missing}
      title={item.path}
      className="press flex w-full flex-col gap-3 rounded-xl border border-ink/10 bg-white/55 p-4 text-left shadow-[0_1px_0_rgb(23_23_21/0.04)] hover:border-ink/20 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs text-ash">{folderName(item.folder)}</span>
      </span>
      <span className="mt-auto flex flex-col gap-1.5">
        <span className="h-1 overflow-hidden rounded-full bg-ink/10">
          <span className="block h-full rounded-full bg-ember" style={{ width: `${frac * 100}%` }} />
        </span>
        <span className="text-xs text-ash">{item.missing ? "File missing" : timeLeft(item.progress) ?? "In progress"}</span>
      </span>
    </button>
  );
}

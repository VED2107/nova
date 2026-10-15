import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { HomeView } from "../features/home/HomeView";
import { LibraryView } from "../features/library/LibraryView";
import { PlayerView } from "../features/player/PlayerView";
import { queue, usePlayback } from "../services/playback/client";
import type { LibraryItem } from "../services/library/types";
import { MEDIA_EXTENSIONS } from "../services/playback/types";

export type View = "home" | "library" | "player";

export function App() {
  const s = usePlayback();
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState<string | null>(null);

  // Any newly started media (library, queue, drop, launch args) shows the player.
  useEffect(() => {
    if (s.sessionId > 0) setView("player");
  }, [s.sessionId]);

  const play = useCallback((item: LibraryItem) => {
    setError(null);
    queue.open([item.path]).catch((e) => setError(e?.message ?? String(e)));
  }, []);

  const openFile = useCallback(async () => {
    const picked = await openDialog({
      multiple: true,
      directory: false,
      filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }, { name: "All files", extensions: ["*"] }],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (paths.length) await queue.open(paths).catch((e) => setError(e?.message ?? String(e)));
  }, []);

  const hasMedia = !["idle", "stopped"].includes(s.phase);

  return (
    <>
      <PlayerView active={view === "player"} onBrowse={() => setView("home")} />
      {view !== "player" && (
        <div className="fixed inset-0 flex flex-col bg-cream text-ink [color-scheme:light]">
          <header className="flex items-center gap-6 border-b border-ink/[0.08] px-8 py-3.5">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-ember" aria-hidden />
              <span className="font-display text-lg font-semibold tracking-tight">NOVA</span>
            </div>
            <nav aria-label="Main" className="flex gap-1">
              {(["home", "library"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-current={view === v ? "page" : undefined}
                  onClick={() => setView(v)}
                  className={`press rounded-full px-3.5 py-1.5 text-sm font-medium capitalize ${view === v ? "bg-ink text-cream" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                >
                  {v}
                </button>
              ))}
            </nav>
            <div className="flex-1" />
            {hasMedia && (
              <button
                type="button"
                onClick={() => setView("player")}
                className="press flex max-w-xs items-center gap-2 rounded-full border border-ink/12 px-3.5 py-1.5 text-sm hover:bg-ink/5"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-ember" aria-hidden />
                <span className="truncate">Now playing · {s.mediaTitle}</span>
              </button>
            )}
            <button type="button" onClick={openFile} className="press rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-ink">
              Open file
            </button>
          </header>
          {error && (
            <p role="alert" className="mx-8 mt-4 rounded-lg bg-ember/10 px-4 py-2.5 text-sm">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "home" ? (
              <HomeView onPlay={play} onOpenLibrary={() => setView("library")} onOpenFile={openFile} />
            ) : (
              <LibraryView onPlay={play} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

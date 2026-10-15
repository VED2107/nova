import { useCallback, useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileIcon, KeyboardIcon, SettingsIcon } from "../components/icons";
import { Wordmark } from "../components/Wordmark";
import { Button, IconButton } from "../components/ui/controls";
import { HomeView } from "../features/home/HomeView";
import { LibraryView } from "../features/library/LibraryView";
import { PlayerView } from "../features/player/PlayerView";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ShortcutsDialog } from "../features/settings/ShortcutsDialog";
import { library } from "../services/library/client";
import type { LibraryItem, PlaylistSummary } from "../services/library/types";
import { actionForChord, chordOf, effectiveKeymap, parseKeymap } from "../services/playback/actions";
import { queue, usePlayback } from "../services/playback/client";
import { MEDIA_EXTENSIONS } from "../services/playback/types";
import { usePrefs } from "../services/prefs";

export type View = "home" | "library" | "player";

export function App() {
  const s = usePlayback();
  const prefs = usePrefs();
  const keymap = useMemo(() => effectiveKeymap(parseKeymap(prefs.keymap)), [prefs.keymap]);
  const [view, setView] = useState<View>("home");
  const [rootId, setRootId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<null | "appearance" | "controls">(null);
  const [help, setHelp] = useState(false);

  // Any newly started media (library, queue, drop, launch args) shows the player.
  useEffect(() => {
    if (s.sessionId > 0) setView("player");
  }, [s.sessionId]);

  const fail = useCallback((e: unknown) => setError((e as { message?: string })?.message ?? String(e)), []);

  const play = useCallback(
    (item: LibraryItem) => {
      setError(null);
      queue.open([item.path]).catch(fail);
    },
    [fail],
  );

  const playPlaylist = useCallback(
    async (p: PlaylistSummary) => {
      setError(null);
      try {
        const { paths, missing } = await library.playlistEntries(p.id);
        if (paths.length === 0) {
          setError(`None of the files in “${p.name}” can be found.`);
          return;
        }
        await queue.open(paths);
        if (missing.length) setError(`${missing.length} ${missing.length === 1 ? "file" : "files"} in “${p.name}” could not be found and were skipped.`);
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const openFile = useCallback(async () => {
    const picked = await openDialog({
      multiple: true,
      directory: false,
      filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }, { name: "All files", extensions: ["*"] }],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (paths.length) await queue.open(paths).catch(fail);
  }, [fail]);

  const addFolder = useCallback(async () => {
    setError(null);
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try {
      const root = await library.addRoot(picked);
      setRootId(root.id);
      setView("library");
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  // Browse-view shortcuts (the player handles its own while active).
  useEffect(() => {
    if (view === "player") return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const t = e.target as HTMLElement | null;
      // In a text field only chords that can't be typing (Ctrl/Alt combos, F-keys) count.
      const typing = !e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d+$/.test(e.key);
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && typing) return;
      const chord = chordOf(e);
      const id = chord && actionForChord(keymap, chord);
      if (id === "file.open") {
        e.preventDefault();
        void openFile();
      } else if (id === "view.settings") {
        e.preventDefault();
        setSettings("appearance");
      } else if (id === "view.help") {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, keymap, openFile]);

  const hasMedia = !["idle", "stopped"].includes(s.phase);

  return (
    <>
      <PlayerView active={view === "player"} onBrowse={() => setView("home")} onOpenSettings={() => setSettings("appearance")} onOpenHelp={() => setHelp(true)} />
      {view !== "player" && (
        <div className="fixed inset-0 flex flex-col bg-paper text-ink">
          <header className="flex items-center gap-5 border-b border-seam px-6 py-2.5">
            <button type="button" onClick={() => setView("home")} aria-label="NOVA home" className="rounded-[4px] py-1 text-ink">
              <Wordmark height={17} />
            </button>
            <nav aria-label="Main" className="flex gap-0.5">
              {(["home", "library"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-current={view === v ? "page" : undefined}
                  onClick={() => {
                    if (v === "library") setRootId(null);
                    setView(v);
                  }}
                  className={`press relative rounded-[6px] px-3 py-1.5 text-[13.5px] font-[600] capitalize ${view === v ? "text-ink" : "text-ink-3 hover:bg-[var(--hover)] hover:text-ink"}`}
                >
                  {v}
                  {view === v && <span aria-hidden className="absolute inset-x-3 -bottom-[11px] h-[2px] bg-ink" />}
                </button>
              ))}
            </nav>
            <div className="flex-1" />
            {hasMedia && (
              <button
                type="button"
                onClick={() => setView("player")}
                className="press flex max-w-[22rem] items-center gap-2 rounded-[6px] border border-seam-strong px-3 py-1.5 text-[13px] hover:bg-[var(--hover)]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-ember" aria-hidden />
                <span className="truncate">
                  <span className="text-ink-3">{s.phase === "paused" ? "Paused" : "Now playing"} · </span>
                  {s.mediaTitle}
                </span>
              </button>
            )}
            <IconButton label="Keyboard & mouse (?)" onClick={() => setHelp(true)}>
              <KeyboardIcon />
            </IconButton>
            <IconButton label="Settings (Ctrl+,)" onClick={() => setSettings("appearance")}>
              <SettingsIcon />
            </IconButton>
            <Button variant="primary" onClick={() => void openFile()} icon={<FileIcon size={16} />}>
              Open file
            </Button>
          </header>
          {error && (
            <p role="alert" className="flex items-center justify-between gap-4 border-b border-seam px-6 py-2 text-[13px] text-ink-2">
              {error}
              <button type="button" onClick={() => setError(null)} className="text-[12.5px] font-[560] text-ink-3 hover:text-ink">
                Dismiss
              </button>
            </p>
          )}
          <div className="min-h-0 flex-1">
            {view === "home" ? (
              <HomeView
                onPlay={play}
                onPlayPlaylist={(p) => void playPlaylist(p)}
                onOpenLibrary={(id) => {
                  setRootId(id ?? null);
                  setView("library");
                }}
                onOpenFile={() => void openFile()}
                onAddFolder={() => void addFolder()}
              />
            ) : (
              <LibraryView onPlay={play} onAddFolder={() => void addFolder()} rootId={rootId} onRootChange={setRootId} />
            )}
          </div>
        </div>
      )}
      <SettingsDialog open={settings != null} initialSection={settings ?? undefined} onClose={() => setSettings(null)} />
      <ShortcutsDialog
        open={help}
        onClose={() => setHelp(false)}
        onCustomize={() => {
          setHelp(false);
          setSettings("controls");
        }}
      />
    </>
  );
}

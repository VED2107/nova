import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { OpenIcon } from "../../components/icons";
import { engineInfo, execute, isPlaybackError, launchMediaPaths, queue, useQueue, usePlayback, type EngineInfo } from "../../services/playback/client";
import { describeError } from "../../services/playback/errors";
import { shortcutFor } from "../../services/playback/shortcuts";
import type { PlaybackError } from "../../services/playback/types";
import { ControlBar } from "./ControlBar";
import { QueuePanel } from "./QueuePanel";
import { ResumeToast } from "./ResumeToast";

const IDLE_HIDE_MS = 2500;
// StrictMode runs effects twice in development; launch files must open once.
let launchHandled = false;

const MEDIA_EXTENSIONS = ["mp4", "mkv", "webm", "mov", "avi", "m4v", "ts", "m2ts", "wmv", "flv", "mp3", "flac", "m4a", "ogg", "opus", "wav"];

export function PlayerView() {
  const s = usePlayback();
  const q = useQueue();
  const [queueOpen, setQueueOpen] = useState(false);
  const queueOpenRef = useRef(false);
  queueOpenRef.current = queueOpen;
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState<PlaybackError | null>(null);
  const [commandError, setCommandError] = useState<PlaybackError | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const menuOpen = useRef(false);
  const overControls = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);

  const reportError = useCallback((e: unknown) => {
    if (isPlaybackError(e)) setCommandError(e);
  }, []);

  /** Replaces the queue (or appends to it) and lets Rust start playback. */
  const openPaths = useCallback(
    async (paths: string[], append = false) => {
      if (paths.length === 0) return;
      setCommandError(null);
      await (append ? queue.append(paths) : queue.open(paths)).catch(reportError);
    },
    [reportError],
  );

  const pickFiles = useCallback(
    async (append = false) => {
      const picked = await openDialog({
        multiple: true,
        directory: false,
        filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }, { name: "All files", extensions: ["*"] }],
      });
      if (picked) await openPaths(Array.isArray(picked) ? picked : [picked], append);
    },
    [openPaths],
  );
  const pickFile = useCallback(() => pickFiles(false), [pickFiles]);

  const toggleFullscreen = useCallback(async (force?: boolean) => {
    const win = getCurrentWindow();
    const next = force ?? !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(await win.isFullscreen());
  }, []);

  // Engine info, launch path, window + drag-drop wiring.
  useEffect(() => {
    engineInfo().then(setEngine, (e) => isPlaybackError(e) && setEngineError(e));
    if (!launchHandled) {
      launchHandled = true;
      launchMediaPaths().then((paths) => void openPaths(paths));
    }
    const win = getCurrentWindow();
    const unResize = win.onResized(async () => setFullscreen(await win.isFullscreen()));
    const unDrop = getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") setDragOver(true);
      else if (p.type === "leave") setDragOver(false);
      else if (p.type === "drop") {
        setDragOver(false);
        // Dropping onto an open queue adds to it; otherwise it replaces it.
        void openPaths(p.paths, queueOpenRef.current);
      }
    });
    return () => {
      unResize.then((f) => f());
      unDrop.then((f) => f());
    };
  }, [openPaths]);

  // Refresh decoder/output info once a file is actually playing.
  useEffect(() => {
    if (s.phase === "playing") engineInfo().then(setEngine, () => {});
  }, [s.sessionId, s.phase === "playing", s.video?.hwdec]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!menuOpen.current && !overControls.current && !queueOpenRef.current) setControlsVisible(false);
    }, IDLE_HIDE_MS);
  }, []);

  const playing = s.phase === "playing";
  useEffect(() => {
    if (!playing) {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else showControls();
  }, [playing, showControls]);

  // Keyboard shortcuts. Keyboard actions apply instantly (no animation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[role=menu]") && ["ArrowUp", "ArrowDown", " ", "Enter"].includes(e.key)) return;
      const action = shortcutFor(e, s);
      if (!action) return;
      e.preventDefault();
      showControls();
      switch (action.kind) {
        case "command":
          void execute(action.command).catch((err) => isPlaybackError(err) && setCommandError(err));
          break;
        case "toggleFullscreen":
          void toggleFullscreen();
          break;
        case "exitFullscreen":
          if (isFullscreen) void toggleFullscreen(false);
          break;
        case "openFile":
          void pickFile();
          break;
        case "queueNext":
          void queue.next().catch(reportError);
          break;
        case "queuePrevious":
          void queue.previous().catch(reportError);
          break;
        case "toggleQueue":
          setQueueOpen((o) => !o);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, isFullscreen, toggleFullscreen, pickFile, showControls, reportError]);

  // Single click toggles pause; double click toggles fullscreen.
  const clickTimer = useRef<number | undefined>(undefined);
  const onSurfaceClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.detail === 2) {
      window.clearTimeout(clickTimer.current);
      void toggleFullscreen();
    } else if (e.detail === 1 && (playing || s.phase === "paused")) {
      clickTimer.current = window.setTimeout(() => void execute({ type: "togglePause" }), 220);
    }
  };

  const error = engineError ?? commandError ?? (s.phase === "error" ? s.error : null);
  const showEmpty = s.phase === "idle" || s.phase === "stopped" || (s.phase === "error" && !s.path);
  const hidden = !controlsVisible && playing;

  return (
    <main
      className={`fixed inset-0 select-none ${hidden ? "cursor-none" : ""}`}
      onMouseMove={showControls}
      onClick={onSurfaceClick}
      aria-label="NOVA player"
    >
      {showEmpty && !error && <EmptyState onOpen={pickFile} />}

      {error && (
        <ErrorPanel
          error={error}
          onOpen={pickFile}
          onRetry={
            s.path && error === s.error
              ? () => void (q.currentId != null ? queue.select(q.currentId) : queue.open([s.path!])).catch(reportError)
              : undefined
          }
        />
      )}

      {s.phase === "loading" && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-2 border-white/15 border-t-ember motion-reduce:animate-none" />
          <span className="sr-only">Loading</span>
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-ember/80 bg-ink/60">
          <p className="font-display text-2xl text-cream">Drop to play</p>
        </div>
      )}

      <div
        className={[
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent",
          "transition-opacity duration-200 ease-(--ease-out-strong)",
          hidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        onMouseEnter={() => (overControls.current = true)}
        onMouseLeave={() => (overControls.current = false)}
      >
        <ControlBar
          snapshot={s}
          engine={engine}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onMenuChange={(open) => {
            menuOpen.current = open;
            if (!open) showControls();
          }}
          queueOpen={queueOpen}
          onToggleQueue={() => setQueueOpen((o) => !o)}
          onError={reportError}
        />
      </div>

      <ResumeToast sessionId={s.sessionId} />

      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} onAddFiles={() => void pickFiles(true)} onError={reportError} />
    </main>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink pb-24">
      <div className="flex items-center gap-3">
        <span className="size-3 rounded-full bg-ember" aria-hidden />
        <h1 className="font-display text-4xl font-semibold tracking-tight text-cream">NOVA</h1>
      </div>
      <p className="max-w-sm text-center text-[15px] leading-relaxed text-ash">
        Drop a video here, or open a file to start watching. Nothing leaves this computer.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="press flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-[#fb8a3c]"
      >
        <OpenIcon width={18} height={18} /> Open file
        <kbd className="ml-1 rounded bg-ink/15 px-1.5 text-xs font-medium">O</kbd>
      </button>
    </div>
  );
}

function ErrorPanel({ error, onOpen, onRetry }: { error: PlaybackError; onOpen: () => void; onRetry?: () => void }) {
  const d = describeError(error);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink/95 pb-24" role="alert">
      <div className="max-w-md px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ember">Playback problem</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-cream">{d.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ash">{d.detail}</p>
        <ul className="mt-4 space-y-1.5 text-sm text-cream/85">
          {d.steps.map((step) => (
            <li key={step} className="flex gap-2"><span className="text-ember">→</span>{step}</li>
          ))}
        </ul>
        <details className="mt-4 text-xs text-ash">
          <summary className="cursor-pointer">Technical details</summary>
          <code className="mt-1 block select-text break-all">{error.kind}: {error.message}</code>
        </details>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onOpen} className="press rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink">Open another file</button>
          {onRetry && (
            <button type="button" onClick={onRetry} className="press rounded-full border border-white/15 px-4 py-2 text-sm text-cream hover:bg-white/8">Try again</button>
          )}
        </div>
      </div>
    </div>
  );
}

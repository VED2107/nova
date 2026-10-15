import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CameraIcon, ChevronLeftIcon, FileIcon, ImmersiveIcon, InfoIcon, NextIcon, QueueIcon, ReplayIcon } from "../../components/icons";
import { Symbol } from "../../components/Wordmark";
import { Button, IconButton } from "../../components/ui/controls";
import { Dialog } from "../../components/ui/Dialog";
import { ACTIONS, actionForChord, chordLabel, chordOf, commandFor, effectiveKeymap, parseKeymap } from "../../services/playback/actions";
import { engineInfo, execute, isPlaybackError, launchMediaPaths, queue, revealScreenshot, screenshot, useQueue, usePlayback, type EngineInfo } from "../../services/playback/client";
import { describeError } from "../../services/playback/errors";
import { formatTime } from "../../services/playback/format";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { parseTimeInput } from "../../services/playback/time";
import { ASPECT_RATIOS, MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS, type PlaybackError, type RepeatMode } from "../../services/playback/types";
import { setPref, usePrefs } from "../../services/prefs";
import { ContextMenu, type CtxGroup } from "./ContextMenu";
import { ControlBar } from "./ControlBar";
import { Inspector } from "./Inspector";
import { QueuePanel } from "./QueuePanel";
import { ResumeToast } from "./ResumeToast";

const IDLE_HIDE_MS = 2500;
const WHEEL_SEEK_MS = 5_000;
const WHEEL_VOLUME = 5;
let launchHandled = false; // StrictMode runs effects twice in development

type Panel = "queue" | "inspector" | null;

/**
 * The Darkroom: video under a transparent WebView, chrome that recedes.
 * Stays mounted while Home/Library are shown (audio keeps playing) and only
 * handles input while `active`.
 */
export function PlayerView(props: { active: boolean; onBrowse: () => void; onOpenSettings: () => void; onOpenHelp: () => void }) {
  const s = usePlayback();
  const q = useQueue();
  const prefs = usePrefs();
  const keymap = useMemo(() => effectiveKeymap(parseKeymap(prefs.keymap)), [prefs.keymap]);
  const hint = (id: string) => (keymap[id]?.[0] ? chordLabel(keymap[id]![0]!) : undefined);

  const [panel, setPanel] = useState<Panel>(null);
  const [immersive, setImmersive] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState<PlaybackError | null>(null);
  const [commandError, setCommandError] = useState<PlaybackError | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nearBottom, setNearBottom] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const menuOpen = useRef(false);
  const overControls = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const panelRef = useRef<Panel>(null);
  panelRef.current = panel;

  // Plain notices fade after 2.6 s; ones with an action stay long enough to use it.
  const flash = useCallback((text: string, action?: Notice["action"]) => {
    const n: Notice = { text, action };
    setNotice(n);
    window.setTimeout(() => setNotice((cur) => (cur === n ? null : cur)), action ? 8000 : 2600);
  }, []);
  const reportError = useCallback(
    (e: unknown) => {
      if (isPlaybackError(e)) {
        // Load-type failures get the full error screen; others a short notice.
        if (["notFound", "unsupportedSource", "editingProject", "requiresExternalDecoder", "engineUnavailable"].includes(e.kind)) setCommandError(e);
        else flash(e.message);
      } else if (e) flash(String(e));
    },
    [flash],
  );
  const run = useCallback((p: Promise<unknown>) => void p.catch(reportError), [reportError]);

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
        filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }, { name: "All files", extensions: ["*"] }],
      });
      if (picked) await openPaths(Array.isArray(picked) ? picked : [picked], append);
    },
    [openPaths],
  );
  const addSubtitle = useCallback(async () => {
    const picked = await openDialog({ multiple: false, directory: false, filters: [{ name: "Subtitles", extensions: [...SUBTITLE_EXTENSIONS] }] });
    if (typeof picked === "string") run(execute({ type: "addSubtitle", path: picked }));
  }, [run]);

  const toggleFullscreen = useCallback(async (force?: boolean) => {
    const win = getCurrentWindow();
    const next = force ?? !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(await win.isFullscreen());
  }, []);

  // Window title follows the media.
  useEffect(() => {
    void getCurrentWindow()
      .setTitle(s.mediaTitle && !["idle", "stopped", "error"].includes(s.phase) ? `${s.mediaTitle} — NOVA` : "NOVA")
      .catch(() => {});
  }, [s.mediaTitle, s.phase]);

  // Engine info, launch files, resize, drag-and-drop (media or subtitle files).
  const phaseRef = useRef(s.phase);
  phaseRef.current = s.phase;
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
        const isSub = (x: string) => SUBTITLE_EXTENSIONS.some((ext) => x.toLowerCase().endsWith(`.${ext}`));
        if (p.paths.length > 0 && p.paths.every(isSub) && phaseRef.current !== "idle") {
          for (const sub of p.paths) void execute({ type: "addSubtitle", path: sub }).catch(() => {});
        } else void openPaths(p.paths, panelRef.current === "queue");
      }
    });
    return () => {
      unResize.then((f) => f());
      unDrop.then((f) => f());
    };
  }, [openPaths]);
  useEffect(() => {
    if (s.phase === "playing") engineInfo().then(setEngine, () => {});
  }, [s.sessionId, s.phase === "playing", s.video?.hwdec]);

  const playing = s.phase === "playing";
  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!menuOpen.current && !overControls.current && !panelRef.current) setControlsVisible(false);
    }, IDLE_HIDE_MS);
  }, []);
  useEffect(() => {
    if (!playing || prefs.autoHide === "off") {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else showControls();
  }, [playing, showControls, prefs.autoHide]);

  const hasMedia = !["idle", "error", "stopped"].includes(s.phase);

  /** Runs any registered action (keyboard, context menu, mouse). */
  const act = useCallback(
    (id: string) => {
      const def = ACTIONS.find((a) => a.id === id);
      if (def?.media && !hasMedia) return;
      const cmd = commandFor(id, s);
      if (cmd) {
        run(execute(cmd));
        return;
      }
      const repeatNext: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
      switch (id) {
        case "loop.ab":
          run(execute(nextAbLoop(s)));
          break;
        case "repeat.cycle": {
          const next = repeatNext[q.repeat];
          run(queue.setRepeat(next));
          flash(next === "off" ? "Repeat off" : next === "one" ? "Repeat this title" : "Repeat the queue");
          break;
        }
        case "queue.next":
          run(queue.next());
          break;
        case "queue.prev":
          run(queue.previous());
          break;
        case "queue.shuffle":
          run(queue.shuffle());
          flash("Upcoming titles shuffled");
          break;
        case "seek.goto":
          setGotoOpen(true);
          break;
        case "time.toggle":
          run(setPref("timeDisplay", prefs.timeDisplay === "remaining" ? "elapsed" : "remaining"));
          break;
        case "subs.add":
          void addSubtitle();
          break;
        case "view.fullscreen":
          void toggleFullscreen();
          break;
        case "view.exitFullscreen":
          if (panelRef.current) setPanel(null);
          else void toggleFullscreen(false);
          break;
        case "video.snapshot":
          screenshot(true).then(
            (path) =>
              flash(`Frame saved to Pictures\\NOVA · ${path.split(/[\\/]/).pop()}`, {
                label: "Show in folder",
                run: () => void revealScreenshot(path).catch((e) => flash(String(e))),
              }),
            (e) => flash(`Couldn't save the frame. ${isPlaybackError(e) ? e.message : String(e)}`),
          );
          break;
        case "view.queue":
          setPanel((p) => (p === "queue" ? null : "queue"));
          break;
        case "view.inspector":
          setPanel((p) => (p === "inspector" ? null : "inspector"));
          break;
        case "view.immersive":
          setImmersive((v) => !v);
          break;
        case "view.library":
          props.onBrowse();
          break;
        case "file.open":
          void pickFiles();
          break;
        case "view.settings":
          props.onOpenSettings();
          break;
        case "view.help":
          props.onOpenHelp();
          break;
      }
    },
    [s, q.repeat, hasMedia, run, flash, addSubtitle, toggleFullscreen, pickFiles, prefs.timeDisplay, props, reportError],
  );

  // Keyboard: chord -> action through the user's keymap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.active || document.querySelector("dialog[open]")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") return;
      if (t?.closest("[role=menu]") && ["ArrowUp", "ArrowDown", " ", "Enter", "Home", "End", "Escape"].includes(e.key)) return;
      const chord = chordOf(e);
      if (!chord) return;
      const id = actionForChord(keymap, chord);
      if (!id) return;
      e.preventDefault();
      if (!immersive) showControls();
      act(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.active, keymap, act, showControls, immersive]);

  // Mouse: click / double-click / wheel / back-forward buttons, per preferences.
  const clickTimer = useRef<number | undefined>(undefined);
  const onSurfaceClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.detail === 2) {
      window.clearTimeout(clickTimer.current);
      if (prefs.dblclick === "fullscreen") void toggleFullscreen();
    } else if (e.detail === 1 && prefs.click === "pause" && hasMedia) {
      clickTimer.current = window.setTimeout(() => act("play.toggle"), prefs.dblclick === "none" ? 0 : 220);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!hasMedia || (e.target as HTMLElement).closest("[role=menu],aside,dialog")) return;
    const overTimeline = (e.target as HTMLElement).closest(".timeline") != null;
    const dir = e.deltaY < 0 || e.deltaX > 0 ? 1 : -1;
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (overTimeline || horizontal || prefs.wheel === "seek") {
      run(execute({ type: "seekRelative", offsetMs: dir * WHEEL_SEEK_MS }));
    } else if (prefs.wheel === "volume") {
      const percent = Math.max(0, Math.min(130, s.volumePercent + dir * WHEEL_VOLUME));
      run(execute({ type: "setVolume", percent }));
      flash(`Volume ${percent}%`);
    }
  };

  const error = engineError ?? commandError ?? (s.phase === "error" ? s.error : null);
  const showEmpty = s.phase === "idle" || s.phase === "stopped" || (s.phase === "error" && !s.path);
  const autoHidden = !controlsVisible && playing && prefs.autoHide === "on";
  const hidden = immersive ? !nearBottom && !panel && !menuOpen.current : autoHidden;
  const topHidden = immersive || autoHidden;

  const tracksOf = (kind: "audio" | "subtitle") => s.tracks.filter((t) => t.kind === kind);
  const ctxGroups: CtxGroup[] = [
    {
      title: "Playback",
      items: [
        { label: s.phase === "playing" ? "Pause" : "Play", hint: hint("play.toggle"), disabled: !hasMedia, run: () => act("play.toggle") },
        { label: "Stop", hint: hint("play.stop"), disabled: !hasMedia, run: () => act("play.stop") },
        { label: "Previous in queue", hint: hint("queue.prev"), disabled: !q.hasPrevious && !hasMedia, run: () => act("queue.prev") },
        { label: "Next in queue", hint: hint("queue.next"), disabled: !q.hasNext && q.repeat !== "all", run: () => act("queue.next") },
        { label: "Go to time…", hint: hint("seek.goto"), disabled: !hasMedia, run: () => act("seek.goto") },
        { label: "Next frame", hint: hint("frame.next"), disabled: !hasMedia, run: () => act("frame.next") },
        { label: "Previous frame", hint: hint("frame.prev"), disabled: !hasMedia, run: () => act("frame.prev") },
        {
          label: `A–B loop${s.abLoop.aMs != null ? ` (${formatTime(s.abLoop.aMs)}${s.abLoop.bMs != null ? `–${formatTime(s.abLoop.bMs)}` : "…"})` : ""}`,
          hint: hint("loop.ab"),
          checked: s.abLoop.aMs != null,
          disabled: !hasMedia,
          run: () => act("loop.ab"),
        },
        { label: "Repeat this title", checked: q.repeat === "one", run: () => run(queue.setRepeat(q.repeat === "one" ? "off" : "one")) },
        { label: "Repeat the queue", checked: q.repeat === "all", run: () => run(queue.setRepeat(q.repeat === "all" ? "off" : "all")) },
        { label: "Shuffle upcoming", hint: hint("queue.shuffle"), run: () => act("queue.shuffle") },
      ],
    },
    {
      title: "Speed",
      items: [0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => ({
        label: v === 1 ? "Normal" : `${v}×`,
        checked: Math.abs(s.speed - v) < 1e-6,
        disabled: !hasMedia,
        run: () => run(execute({ type: "setSpeed", multiplier: v })),
      })),
    },
    {
      title: "Audio",
      items: [
        ...tracksOf("audio").map((t, i) => ({
          label: t.title ?? t.language ?? `Track ${i + 1}`,
          checked: t.isSelected,
          run: () => run(execute({ type: "selectAudioTrack", trackId: t.id })),
        })),
        { label: s.isMuted ? "Unmute" : "Mute", hint: hint("volume.mute"), run: () => act("volume.mute") },
        { label: `Audio later (now ${s.adjust.audioDelayMs} ms)`, hint: hint("audio.later"), disabled: !hasMedia, run: () => act("audio.later") },
        { label: "Audio earlier", hint: hint("audio.earlier"), disabled: !hasMedia, run: () => act("audio.earlier") },
        { label: "Reset audio delay", disabled: s.adjust.audioDelayMs === 0, run: () => act("audio.reset") },
      ],
    },
    {
      title: "Subtitles",
      items: [
        {
          label: "Off",
          checked: !tracksOf("subtitle").some((t) => t.isSelected),
          disabled: !hasMedia,
          run: () => run(execute({ type: "selectSubtitleTrack", trackId: null })),
        },
        ...tracksOf("subtitle").map((t, i) => ({
          label: t.title ?? t.language ?? `Subtitle ${i + 1}`,
          checked: t.isSelected,
          run: () => run(execute({ type: "selectSubtitleTrack", trackId: t.id })),
        })),
        { label: "Add subtitle file…", hint: hint("subs.add"), disabled: !hasMedia, run: () => act("subs.add") },
        { label: `Subtitles later (now ${s.adjust.subtitleDelayMs} ms)`, hint: hint("subs.later"), disabled: !hasMedia, run: () => act("subs.later") },
        { label: "Subtitles earlier", hint: hint("subs.earlier"), disabled: !hasMedia, run: () => act("subs.earlier") },
        { label: "Reset subtitle delay", disabled: s.adjust.subtitleDelayMs === 0, run: () => act("subs.reset") },
      ],
    },
    {
      title: "Video",
      items: [
        { label: isFullscreen ? "Exit fullscreen" : "Fullscreen", hint: hint("view.fullscreen"), run: () => act("view.fullscreen") },
        { label: "Aspect: as encoded", checked: s.adjust.aspectRatio == null, disabled: !hasMedia, run: () => run(execute({ type: "setAspectRatio", ratio: null })) },
        ...ASPECT_RATIOS.map((r) => ({
          label: `Aspect: ${r}`,
          checked: s.adjust.aspectRatio === r,
          disabled: !hasMedia,
          run: () => run(execute({ type: "setAspectRatio", ratio: r })),
        })),
        { label: `Rotate 90° (now ${s.adjust.rotation}°)`, hint: hint("video.rotate"), disabled: !hasMedia, run: () => act("video.rotate") },
        { label: "Deinterlace", hint: hint("video.deinterlace"), checked: s.adjust.deinterlace, disabled: !hasMedia, run: () => act("video.deinterlace") },
        { label: "Save frame to Pictures", hint: hint("video.snapshot"), disabled: !hasMedia, run: () => act("video.snapshot") },
      ],
    },
    {
      title: "View",
      items: [
        { label: "Queue", hint: hint("view.queue"), checked: panel === "queue", run: () => act("view.queue") },
        { label: "Playback details", hint: hint("view.inspector"), checked: panel === "inspector", run: () => act("view.inspector") },
        { label: "Immersive mode", hint: hint("view.immersive"), checked: immersive, run: () => act("view.immersive") },
        { label: "Open file…", hint: hint("file.open"), run: () => act("file.open") },
        { label: "Back to library", hint: hint("view.library"), run: () => act("view.library") },
        { label: "Keyboard shortcuts", hint: hint("view.help"), run: () => act("view.help") },
        { label: "Settings…", hint: hint("view.settings"), run: () => act("view.settings") },
      ],
    },
  ];

  return (
    <main
      className={`fixed inset-0 select-none ${hidden && hasMedia ? "cursor-none" : ""}`}
      onMouseMove={(e) => {
        if (immersive) setNearBottom(window.innerHeight - e.clientY < 150);
        else showControls();
      }}
      onClick={onSurfaceClick}
      onWheel={onWheel}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={(e) => {
        if (e.button === 3) act("queue.prev");
        if (e.button === 4) act("queue.next");
      }}
      aria-label="NOVA player"
      inert={!props.active}
    >
      {showEmpty && !error && <EmptyState onOpen={() => void pickFiles()} onBrowse={props.onBrowse} openHint={hint("file.open")} />}

      {error && (
        <ErrorPanel
          error={error}
          onOpen={() => void pickFiles()}
          onBrowse={props.onBrowse}
          onRetry={s.path && error === s.error ? () => run(q.currentId != null ? queue.select(q.currentId) : queue.open([s.path!])) : undefined}
        />
      )}

      {(s.phase === "loading" || s.phase === "seeking") && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-room-ink-2 motion-safe:animate-pulse">
            <Symbol size={s.phase === "loading" ? 44 : 28} />
          </span>
          <span className="sr-only">{s.phase === "loading" ? "Loading" : "Seeking"}</span>
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-[14px] border-2 border-dashed border-ember/80 bg-room/70">
          <p className="spine text-[32px] text-cream">{panel === "queue" ? "Drop to add to the queue" : "Drop to play"}</p>
        </div>
      )}

      {/* Top bar: back to the shelf, title + engine spec, panels. */}
      <div
        className={[
          "absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 pb-12 pt-3 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]",
          "transition-opacity duration-200 ease-(--ease-out-strong)",
          topHidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        style={{ right: panel ? 380 : 0 }}
        onMouseEnter={() => (overControls.current = true)}
        onMouseLeave={() => (overControls.current = false)}
        onClick={(e) => e.stopPropagation()}
      >
        <Button tone="room" variant="ghost" onClick={props.onBrowse} icon={<ChevronLeftIcon size={18} />} className="text-room-ink">
          Library
        </Button>
        <div className="min-w-0 flex-1 pl-1 pt-0.5">
          {hasMedia && s.mediaTitle && <p className="spine truncate text-[19px] text-room-ink">{s.mediaTitle}</p>}
          {hasMedia && s.video && (
            <p className="truncate text-[12px] text-room-ink-2">
              {[s.video.codec?.toUpperCase(), s.video.width ? `${s.video.width}×${s.video.height}` : null, s.video.hwdec ? "hardware decoding" : "software decoding"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {hasMedia && (
          <IconButton tone="room" label={`Save frame to Pictures (${hint("video.snapshot") ?? "Shift+S"})`} onClick={() => act("video.snapshot")}>
            <CameraIcon />
          </IconButton>
        )}
        <IconButton tone="room" label={`Immersive mode (${hint("view.immersive") ?? "Z"})`} active={immersive} aria-pressed={immersive} onClick={() => act("view.immersive")}>
          <ImmersiveIcon />
        </IconButton>
        <IconButton tone="room" label={`Queue (${hint("view.queue") ?? "Q"})`} active={panel === "queue"} aria-pressed={panel === "queue"} onClick={() => act("view.queue")}>
          <QueueIcon />
        </IconButton>
        <IconButton
          tone="room"
          label={`Playback details (${hint("view.inspector") ?? "I"})`}
          active={panel === "inspector"}
          aria-pressed={panel === "inspector"}
          onClick={() => act("view.inspector")}
        >
          <InfoIcon />
        </IconButton>
      </div>

      <ResumeToast sessionId={s.sessionId} />

      {s.phase === "ended" && !error && (
        <EndedCard
          title={s.mediaTitle}
          next={q.hasNext ? q.items[q.items.findIndex((i) => i.id === q.currentId) + 1]?.title : undefined}
          onReplay={() => run(execute({ type: "play" }))}
          onNext={() => run(queue.next())}
          onBrowse={props.onBrowse}
        />
      )}

      {(notice || s.issues.length > 0) && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          {notice && (
            <p role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-room-glass py-1.5 pl-4 pr-1.5 text-[13px] text-room-ink ring-1 ring-room-seam">
              <span className={notice.action ? "" : "pr-2.5"}>{notice.text}</span>
              {notice.action && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    notice.action!.run();
                  }}
                  className="press rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-[600] text-room-ink hover:bg-white/15"
                >
                  {notice.action.label}
                </button>
              )}
            </p>
          )}
          {s.issues.map((issue) => (
            <div key={issue.kind} role="status" className="max-w-lg rounded-[10px] bg-room-glass px-4 py-3 text-[13px] text-room-ink ring-1 ring-room-seam">
              <p className="font-[650]">
                {issue.kind === "videoDecoderMissing" ? "NOVA can't decode this video" : "NOVA can't decode this audio"}
                <span className="font-normal text-room-ink-2"> · codec {issue.codec}</span>
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-room-ink-2">
                {issue.kind === "videoDecoderMissing" ? "Sound plays without picture. " : "Picture plays without sound. "}
                Export the file to H.264, HEVC or ProRes, or open it in the software that recorded it.
              </p>
            </div>
          ))}
        </div>
      )}

      <div
        className={[
          "absolute bottom-0 left-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent",
          "transition-opacity duration-200 ease-(--ease-out-strong)",
          hidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        style={{ right: panel ? 380 : 0 }}
        onMouseEnter={() => (overControls.current = true)}
        onMouseLeave={() => (overControls.current = false)}
        onClick={(e) => e.stopPropagation()}
      >
        <ControlBar
          snapshot={s}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onMenuChange={(open) => {
            menuOpen.current = open;
            if (!open) showControls();
          }}
          onError={reportError}
        />
      </div>

      {panel && (
        <aside
          className="absolute inset-y-0 right-0 z-30 w-[380px] border-l border-room-seam bg-room-glass text-room-ink backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setPanel(null);
            }
          }}
        >
          {panel === "queue" ? (
            <QueuePanel onClose={() => setPanel(null)} onAddFiles={() => void pickFiles(true)} onError={reportError} />
          ) : (
            <Inspector open sessionId={s.sessionId} engine={engine} issues={s.issues} onClose={() => setPanel(null)} />
          )}
        </aside>
      )}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} groups={ctxGroups} onClose={() => setCtx(null)} />}

      <GoToTime
        open={gotoOpen}
        durationMs={s.durationMs}
        onClose={() => setGotoOpen(false)}
        onGo={(ms) => {
          setGotoOpen(false);
          run(execute({ type: "seek", positionMs: ms, exact: true }));
        }}
      />
    </main>
  );
}

type Notice = { text: string; action?: { label: string; run: () => void } };

/** End of the last title: say so, and offer the obvious next moves. */
function EndedCard(props: { title: string | null; next?: string; onReplay: () => void; onNext: () => void; onBrowse: () => void }) {
  return (
    <div
      role="status"
      className="rise absolute bottom-36 left-6 z-20 w-[min(440px,calc(100vw-48px))] rounded-[12px] bg-room-glass p-5 ring-1 ring-room-seam backdrop-blur-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[11.5px] font-[650] uppercase tracking-[0.14em] text-ember">Finished</p>
      {props.title && <p className="spine mt-1 truncate text-[22px] text-room-ink">{props.title}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {props.next && (
          <Button variant="primary" onClick={props.onNext} icon={<NextIcon size={16} />} className="max-w-full">
            <span className="truncate">Play next · {props.next}</span>
          </Button>
        )}
        <Button tone="room" variant={props.next ? "quiet" : "primary"} onClick={props.onReplay} icon={<ReplayIcon size={16} />}>
          Play again
        </Button>
        <Button tone="room" variant="ghost" onClick={props.onBrowse}>
          Back to library
        </Button>
      </div>
    </div>
  );
}

function GoToTime(props: { open: boolean; durationMs: number | null; onClose: () => void; onGo: (ms: number) => void }) {
  const [text, setText] = useState("");
  const ms = parseTimeInput(text);
  const tooLong = ms != null && props.durationMs != null && ms > props.durationMs;
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Go to time" width="min(380px, calc(100vw - 48px))">
      <form
        className="px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ms != null && !tooLong) {
            props.onGo(ms);
            setText("");
          }
        }}
      >
        <label className="block text-[13px] text-ink-2">
          Time ({props.durationMs != null ? `up to ${formatTime(props.durationMs)}` : "hh:mm:ss"})
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder="1:02:30"
            aria-invalid={text !== "" && (ms == null || tooLong)}
            className="mt-1.5 h-10 w-full rounded-[8px] border border-seam-strong bg-paper-raised px-3 text-[16px] tabular-nums text-ink focus:border-ember focus:outline-none"
          />
        </label>
        <p className="mt-2 min-h-4 text-[12.5px] text-danger" role="alert">
          {text && ms == null ? "Use hh:mm:ss, mm:ss, seconds, or 1h2m3s." : tooLong ? "That's past the end of this title." : ""}
        </p>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" type="submit" disabled={ms == null || tooLong}>
            Go
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EmptyState({ onOpen, onBrowse, openHint }: { onOpen: () => void; onBrowse: () => void; openHint?: string }) {
  return (
    <div className="absolute inset-0 flex items-center bg-room px-[8vw]" onClick={(e) => e.stopPropagation()}>
      <div className="max-w-lg">
        <h1 className="spine-xl text-[64px] text-cream">Nothing playing</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-room-ink-2">Drop a file anywhere in this window, open one, or pick something from your shelf.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" onClick={onOpen} icon={<FileIcon size={16} />}>
            Open file{openHint && <span className="ml-1 opacity-70">{openHint}</span>}
          </Button>
          <Button tone="room" onClick={onBrowse}>
            Go to library
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorPanel({ error, onOpen, onRetry, onBrowse }: { error: PlaybackError; onOpen: () => void; onRetry?: () => void; onBrowse: () => void }) {
  const d = describeError(error);
  return (
    <div className="absolute inset-0 flex items-center bg-room px-[8vw]" role="alert" onClick={(e) => e.stopPropagation()}>
      <div className="max-w-xl">
        <h2 className="spine-xl text-[48px] text-cream">{d.title}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-room-ink-2">{d.detail}</p>
        <ul className="mt-4 space-y-1.5 text-[14px] text-room-ink">
          {d.steps.map((step) => (
            <li key={step} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ember" />
              {step}
            </li>
          ))}
        </ul>
        <details className="mt-4 text-[12.5px] text-room-ink-3">
          <summary className="cursor-pointer hover:text-room-ink-2">Technical details</summary>
          <code className="mt-1 block select-text break-all">
            {error.kind}: {error.message}
          </code>
        </details>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" onClick={onOpen}>
            Open another file
          </Button>
          {onRetry && (
            <Button tone="room" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button tone="room" variant="ghost" onClick={onBrowse}>
            Go to library
          </Button>
        </div>
      </div>
    </div>
  );
}

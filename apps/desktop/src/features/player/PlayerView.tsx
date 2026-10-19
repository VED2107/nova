import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ChevronLeftIcon, FileIcon, NextIcon, ReplayIcon } from "../../components/icons";
import { OsdMenu } from "../../components/OsdMenu";
import { Symbol } from "../../components/Wordmark";
import { Button, IconButton } from "../../components/ui/controls";
import { Dialog } from "../../components/ui/Dialog";
import { ACTIONS, actionForChord, chordLabel, chordOf, commandFor, effectiveKeymap, nextSubScale, parseKeymap } from "../../services/playback/actions";
import { engineInfo, execute, isPlaybackError, launchMediaPaths, onLaunchOpen, queue, revealScreenshot, screenshot, useQueue, usePlayback, type EngineInfo } from "../../services/playback/client";
import { describeError } from "../../services/playback/errors";
import { formatTime } from "../../services/playback/format";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { parseTimeInput } from "../../services/playback/time";
import { MAX_VOLUME, MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS, type PlaybackError, type PlaybackSnapshot, type RepeatMode } from "../../services/playback/types";
import { setPref, usePrefs } from "../../services/prefs";
import { ControlBar, type DeckMenu } from "./ControlBar";
import { Inspector } from "./Inspector";
import { buildPlayerMenus } from "./playerMenu";
import { QueuePanel } from "./QueuePanel";
import { ResumeToast } from "./ResumeToast";

const IDLE_HIDE_MS = 2500;
const WHEEL_SEEK_MS = 5_000;
const WHEEL_VOLUME = 5;
const SUB_MARGIN_BASE = 22; // the engine's own default bottom margin
const PANEL_WIDTH = 380;
const OSD_MS = 1400;
let launchHandled = false; // StrictMode runs effects twice in development

type Panel = "queue" | "inspector" | null;
type MenuState = { which: DeckMenu; x?: number; y?: number; anchor?: DOMRect; fromKeyboard?: boolean };
/** On-screen readout: an engraved name, the engine's value, an optional level. */
type Osd = { name: string; value: string; level?: number; action?: { label: string; run: () => void }; long?: boolean };

/**
 * The monitor: video under a transparent WebView, chrome that recedes.
 * Stays mounted while Home/Library are shown (audio keeps playing) and only
 * handles input while `active`.
 */
export function PlayerView(props: { active: boolean; onBrowse: () => void; onOpenSettings: () => void; onOpenHelp: () => void }) {
  const s = usePlayback();
  const q = useQueue();
  const prefs = usePrefs();
  const keymap = useMemo(() => effectiveKeymap(parseKeymap(prefs.keymap)), [prefs.keymap]);
  const hint = useCallback((id: string) => (keymap[id]?.[0] ? chordLabel(keymap[id]![0]!) : undefined), [keymap]);

  const [panel, setPanel] = useState<Panel>(null);
  const [immersive, setImmersive] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState<PlaybackError | null>(null);
  const [commandError, setCommandError] = useState<PlaybackError | null>(null);
  const [osd, setOsd] = useState<Osd | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nearBottom, setNearBottom] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const overControls = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const osdTimer = useRef<number | undefined>(undefined);
  const panelRef = useRef<Panel>(null);
  panelRef.current = panel;
  const menuRef = useRef(false);
  menuRef.current = menu != null;

  const showOsd = useCallback((o: Osd) => {
    setOsd(o);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), o.action ? 8000 : o.long ? 3200 : OSD_MS);
  }, []);
  const flash = useCallback((text: string, action?: Osd["action"]) => showOsd({ name: "", value: text, action, long: true }), [showOsd]);
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
    // Media replaces what plays; subtitle files alone are added to it.
    const incoming = (paths: string[], append = false) => {
      const isSub = (x: string) => SUBTITLE_EXTENSIONS.some((ext) => x.toLowerCase().endsWith(`.${ext}`));
      if (paths.length > 0 && paths.every(isSub)) {
        if (phaseRef.current === "idle") flash("Open a video first, then add its subtitles.");
        else for (const sub of paths) void execute({ type: "addSubtitle", path: sub }).catch(() => {});
      } else void openPaths(paths, append);
    };
    // Explorer may start one launch per selected file; gather a burst into one queue.
    let burst: string[] = [];
    let burstTimer: number | undefined;
    const unLaunch = onLaunchOpen((paths) => {
      burst.push(...paths);
      window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => {
        incoming(burst);
        burst = [];
      }, 250);
    });
    if (!launchHandled) {
      launchHandled = true;
      // Ask only once listening, so a launch forwarded in between is not lost.
      void unLaunch.then(launchMediaPaths).then((paths) => incoming(paths));
    }
    const win = getCurrentWindow();
    const unResize = win.onResized(async () => setFullscreen(await win.isFullscreen()));
    const unDrop = getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") setDragOver(true);
      else if (p.type === "leave") setDragOver(false);
      else if (p.type === "drop") {
        setDragOver(false);
        incoming(p.paths, panelRef.current === "queue");
      }
    });
    return () => {
      window.clearTimeout(burstTimer);
      unLaunch.then((f) => f());
      unResize.then((f) => f());
      unDrop.then((f) => f());
    };
  }, [openPaths, flash]);
  useEffect(() => {
    if (s.phase === "playing") engineInfo().then(setEngine, () => {});
  }, [s.sessionId, s.phase === "playing", s.video?.hwdec]);

  // Subtitle size: the saved size is applied once the engine is up; after that
  // every engine-confirmed change is saved (Ctrl+wheel, keys, menu).
  const scaleApplied = useRef(false);
  useEffect(() => {
    if (s.seq === 0) return;
    const saved = Number(prefs.subScale) || 100;
    if (!scaleApplied.current) {
      scaleApplied.current = true;
      if (s.adjust.subtitleScalePercent !== saved) void execute({ type: "setSubtitleScale", percent: saved }).catch(() => {});
      return;
    }
    const now = s.adjust.subtitleScalePercent;
    if (now !== saved && now % 10 === 0 && now >= 50 && now <= 300) {
      persistedScale.current = String(now);
      void setPref("subScale", String(now)).catch(() => {});
    }
  }, [s.seq === 0, s.adjust.subtitleScalePercent]);
  // A change made in Settings (not one we just saved from the engine) is sent to the engine.
  const persistedScale = useRef<string | null>(null);
  useEffect(() => {
    if (!scaleApplied.current || prefs.subScale === persistedScale.current) return;
    const want = Number(prefs.subScale) || 100;
    if (want !== s.adjust.subtitleScalePercent) void execute({ type: "setSubtitleScale", percent: want }).catch(() => {});
  }, [prefs.subScale]);

  // OSD readouts follow engine-confirmed changes, never the request.
  const prev = useRef<PlaybackSnapshot | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (!p || p.sessionId !== s.sessionId || !props.active) return;
    const a = s.adjust;
    const pa = p.adjust;
    const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)} ms`;
    if (s.volumePercent !== p.volumePercent || s.isMuted !== p.isMuted)
      showOsd({ name: "Volume", value: s.isMuted ? "Muted" : `${s.volumePercent}%`, level: s.isMuted ? 0 : s.volumePercent / MAX_VOLUME });
    else if (a.subtitleScalePercent !== pa.subtitleScalePercent) showOsd({ name: "Subtitle size", value: `${a.subtitleScalePercent}%`, level: (a.subtitleScalePercent - 50) / 250 });
    else if (a.subtitleDelayMs !== pa.subtitleDelayMs) showOsd({ name: "Subtitle delay", value: signed(a.subtitleDelayMs) });
    else if (a.audioDelayMs !== pa.audioDelayMs) showOsd({ name: "Audio delay", value: signed(a.audioDelayMs) });
    else if (Math.abs(s.speed - p.speed) > 1e-6) showOsd({ name: "Speed", value: `${+s.speed.toFixed(2)}×` });
    else if (a.aspectRatio !== pa.aspectRatio) showOsd({ name: "Aspect ratio", value: a.aspectRatio ?? "As encoded" });
    else if (a.rotation !== pa.rotation) showOsd({ name: "Rotation", value: `${a.rotation}°` });
    else if (a.deinterlace !== pa.deinterlace) showOsd({ name: "Deinterlace", value: a.deinterlace ? "On" : "Off" });
    else if (s.abLoop.aMs !== p.abLoop.aMs || s.abLoop.bMs !== p.abLoop.bMs)
      showOsd({
        name: "A–B loop",
        value: s.abLoop.aMs == null ? "Off" : s.abLoop.bMs == null ? `Start ${formatTime(s.abLoop.aMs)}` : `${formatTime(s.abLoop.aMs)} – ${formatTime(s.abLoop.bMs)}`,
      });
    else {
      const pick = (kind: "audio" | "subtitle", snap: PlaybackSnapshot) => snap.tracks.find((t) => t.kind === kind && t.isSelected)?.id ?? null;
      for (const kind of ["subtitle", "audio"] as const) {
        if (pick(kind, s) !== pick(kind, p) && p.tracks.length > 0) {
          const t = s.tracks.find((x) => x.kind === kind && x.isSelected);
          showOsd({ name: kind === "audio" ? "Audio" : "Subtitles", value: t ? (t.title ?? t.language?.toUpperCase() ?? "On") : "Off" });
          break;
        }
      }
    }
  }, [s, props.active, showOsd]);

  const playing = s.phase === "playing";
  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!menuRef.current && !overControls.current && !panelRef.current) setControlsVisible(false);
    }, IDLE_HIDE_MS);
  }, []);
  useEffect(() => {
    if (!playing || prefs.autoHide === "off") {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else showControls();
  }, [playing, showControls, prefs.autoHide]);
  // Closing a menu restarts the idle timer instead of hiding at once.
  useEffect(() => {
    if (!menu && playing) showControls();
  }, [menu == null]);

  const hasMedia = !["idle", "error", "stopped"].includes(s.phase);
  const compactDeck = prefs.timelineLayout === "compact";

  /** Runs any registered action (keyboard, menus, mouse). */
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
          showOsd({ name: "Repeat", value: next === "off" ? "Off" : next === "one" ? "This title" : "The whole queue" });
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
          showOsd({ name: "Queue", value: "Upcoming titles shuffled" });
          break;
        case "chapter.next":
        case "chapter.prev":
          if (s.chapters.length === 0) showOsd({ name: "Chapters", value: "This file has none" });
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
        case "view.deck":
          run(setPref("timelineLayout", prefs.timelineLayout === "compact" ? "wide" : "compact"));
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
    [s, q.repeat, hasMedia, run, flash, showOsd, addSubtitle, toggleFullscreen, pickFiles, prefs.timeDisplay, prefs.timelineLayout, props],
  );

  // Keyboard: chord -> action through the user's keymap. The menu key (or
  // Shift+F10) opens the full menu in the middle of the picture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.active || document.querySelector("dialog[open]")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") return;
      if (t?.closest("[role=menu]")) return;
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        setMenu({ which: "root", x: window.innerWidth / 2 - 120, y: window.innerHeight / 3, fromKeyboard: true });
        return;
      }
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
    // Panels, menus and dialogs scroll normally; only the picture and the deck take gestures.
    if (!hasMedia || (e.target as HTMLElement).closest("[role=menu],aside,dialog")) return;
    const dir = e.deltaY < 0 || e.deltaX > 0 ? 1 : -1;
    const overTimeline = (e.target as HTMLElement).closest(".timeline") != null;
    if (e.ctrlKey && !overTimeline) {
      e.preventDefault();
      if (prefs.ctrlWheel === "subtitleSize") run(execute({ type: "setSubtitleScale", percent: nextSubScale(s.adjust.subtitleScalePercent, dir) }));
      else if (prefs.ctrlWheel === "volume") run(execute({ type: "setVolume", percent: Math.max(0, Math.min(MAX_VOLUME, s.volumePercent + dir * WHEEL_VOLUME)) }));
      return;
    }
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (overTimeline || horizontal || prefs.wheel === "seek") {
      run(execute({ type: "seekRelative", offsetMs: dir * WHEEL_SEEK_MS }));
      showOsd({ name: "Seek", value: `${dir > 0 ? "+" : "−"}${WHEEL_SEEK_MS / 1000} s` });
    } else if (prefs.wheel === "volume") {
      run(execute({ type: "setVolume", percent: Math.max(0, Math.min(MAX_VOLUME, s.volumePercent + dir * WHEEL_VOLUME)) }));
    }
  };
  // Ctrl+wheel must not zoom the WebView; React's wheel listener is passive, so block it natively.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener("wheel", block, { passive: false });
    return () => el.removeEventListener("wheel", block);
  }, []);

  const error = engineError ?? commandError ?? (s.phase === "error" ? s.error : null);
  const showEmpty = s.phase === "idle" || s.phase === "stopped" || (s.phase === "error" && !s.path);
  const autoHidden = !controlsVisible && playing && prefs.autoHide === "on";
  const hidden = immersive ? !nearBottom && !panel && !menu : autoHidden && !menu;
  const topHidden = immersive || (autoHidden && !menu);

  // Subtitles are drawn by the engine under the WebView, so lift them above the
  // deck while it is visible and let them fall back when it hides.
  const deckRef = useRef<HTMLDivElement>(null);
  const subsLifted = hasMedia && !hidden;
  useEffect(() => {
    if (!hasMedia) return;
    const apply = () => {
      const deck = deckRef.current?.getBoundingClientRect();
      const h = window.innerHeight;
      const px = subsLifted && deck ? h - deck.top + 12 : 0;
      const margin = Math.min(400, Math.round(SUB_MARGIN_BASE + (px / h) * 720));
      void execute({ type: "setSubtitleMargin", margin }).catch(() => {});
    };
    const raf = requestAnimationFrame(apply);
    window.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
    };
  }, [subsLifted, hasMedia, s.sessionId, prefs.timelineLayout, isFullscreen]);

  // A side panel reserves its width in the engine, so the picture re-centres beside it.
  useEffect(() => {
    if (!hasMedia) return;
    const apply = () => {
      const ratio = panel ? Math.min(0.6, PANEL_WIDTH / window.innerWidth) : 0;
      void execute({ type: "setVideoMarginRight", ratio: Math.round(ratio * 1000) / 1000 }).catch(() => {});
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [panel, hasMedia, s.sessionId]);

  const menus = buildPlayerMenus({
    s,
    q,
    hasMedia,
    isFullscreen,
    immersive,
    compactDeck,
    panel,
    act,
    exec: (c) => run(execute(c)),
    setRepeat: (m) => run(queue.setRepeat(m)),
    hint,
  });
  const menuLabel: Record<DeckMenu, string> = { root: "Player menu", speed: "Playback speed", audio: "Audio", subtitles: "Subtitles" };

  const tally = s.phase === "playing" || s.phase === "seeking" ? "live" : s.phase === "loading" ? "busy" : hasMedia ? "held" : "idle";
  const stateWord = { playing: "Playing", paused: "Paused", loading: "Loading", seeking: "Seeking", ended: "Ended", stopped: "Stopped", idle: "No signal", error: "Error" }[s.phase];
  const spec = s.video
    ? [s.video.codec?.toUpperCase(), s.video.width ? `${s.video.width}×${s.video.height}` : null, s.video.hwdec ? "hardware decode" : "software decode"].filter(Boolean)
    : [];

  return (
    <main
      ref={mainRef}
      className={`fixed inset-0 select-none ${hidden && hasMedia ? "cursor-none" : ""}`}
      onMouseMove={(e) => {
        if (immersive) setNearBottom(window.innerHeight - e.clientY < 150);
        else showControls();
      }}
      onClick={onSurfaceClick}
      onWheel={onWheel}
      onContextMenu={(e) => {
        e.preventDefault();
        if ((e.target as HTMLElement).closest("aside,dialog")) return;
        setMenu({ which: "root", x: e.clientX, y: e.clientY });
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
          fileName={error === s.error && s.path ? s.path.split(/[\\/]/).pop() : undefined}
          onOpen={() => void pickFiles()}
          onBrowse={props.onBrowse}
          onRetry={s.path && error === s.error ? () => run(q.currentId != null ? queue.select(q.currentId) : queue.open([s.path!])) : undefined}
        />
      )}

      {s.phase === "loading" && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-room-ink-2 motion-safe:animate-pulse">
            <Symbol size={44} />
          </span>
          <span className="sr-only">Loading</span>
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-[10px] border-2 border-dashed border-ember/80 bg-room/80">
          <p className="spine text-[32px] text-cream">{panel === "queue" ? "Drop to add to the queue" : "Drop to play"}</p>
        </div>
      )}

      {/* Top strip: the way back, then one title block — what is on the monitor and its state. */}
      {!showEmpty && (
        <div
          className={[
            "glass-top absolute inset-x-0 top-0 z-20 flex items-center gap-3 py-2 pl-2 pr-5",
            "transition-opacity duration-200 ease-(--ease-out-strong)",
            topHidden ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          style={{ right: panel ? PANEL_WIDTH : 0 }}
          onMouseEnter={() => (overControls.current = true)}
          onMouseLeave={() => (overControls.current = false)}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton tone="room" label={`Back to library (${hint("view.library") ?? "Backspace"})`} onClick={props.onBrowse} className="bg-white/[0.08] text-room-ink">
            <ChevronLeftIcon size={20} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="spine truncate text-[18px] leading-tight text-room-ink">{hasMedia && s.mediaTitle ? s.mediaTitle : stateWord}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-room-ink-2" role="status" aria-label={`Player ${stateWord}`}>
              <span className="tally" data-state={tally} aria-hidden />
              <span className={`engrave ${tally === "live" ? "text-room-ink" : ""}`}>{stateWord}</span>
              {hasMedia && spec.length > 0 && (
                <button
                  type="button"
                  onClick={() => act("view.inspector")}
                  title={`Playback details (${hint("view.inspector") ?? "I"})`}
                  className="readout truncate rounded-[3px] text-[11.5px] hover:text-room-ink max-[640px]:hidden"
                >
                  · {spec.join(" · ")}
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      <ResumeToast sessionId={s.sessionId} hasMedia={hasMedia} />

      {s.phase === "ended" && !error && (
        <EndedCard
          title={s.mediaTitle}
          next={q.hasNext ? q.items[q.items.findIndex((i) => i.id === q.currentId) + 1]?.title : undefined}
          onReplay={() => run(execute({ type: "play" }))}
          onNext={() => run(queue.next())}
          onBrowse={props.onBrowse}
        />
      )}

      {/* OSD readout, top right like a monitor's. Engine-confirmed values only. */}
      <div className="pointer-events-none absolute right-4 top-[60px] z-20 flex flex-col items-end gap-2" style={{ right: (panel ? PANEL_WIDTH : 0) + 16 }}>
        {osd && (
          <div key={`${osd.name}-${osd.value}`} role="status" className="osd-notice pointer-events-auto flex max-w-[min(520px,70vw)] items-center gap-3 rounded-[6px] border border-room-seam bg-room-ply px-3 py-2 shadow-[0_10px_28px_-12px_rgb(0_0_0/0.8)]" onClick={(e) => e.stopPropagation()}>
            {osd.name && <span className="engrave text-room-ink-3">{osd.name}</span>}
            <span className={`text-[13px] text-room-ink ${osd.name ? "readout" : ""}`}>{osd.value}</span>
            {osd.level != null && (
              <span aria-hidden className="relative h-[3px] w-20 overflow-hidden rounded-full bg-white/[0.18]">
                <span className="absolute inset-y-0 left-0 bg-cream" style={{ width: `${Math.max(0, Math.min(1, osd.level)) * 100}%` }} />
              </span>
            )}
            {osd.action && (
              <button type="button" onClick={osd.action.run} className="press rounded-[4px] bg-white/10 px-2.5 py-1 text-[12.5px] font-[600] text-room-ink hover:bg-white/15">
                {osd.action.label}
              </button>
            )}
          </div>
        )}
        {s.issues.map((issue) => (
          <div key={issue.kind} role="status" className="pointer-events-auto max-w-md rounded-[6px] border border-room-seam bg-room-ply px-4 py-3 text-[13px] text-room-ink">
            <p className="font-[650]">
              {issue.kind === "videoDecoderMissing" ? "NOVA can't decode this video" : "NOVA can't decode this audio"}
              <span className="readout font-normal text-room-ink-2"> · {issue.codec}</span>
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-room-ink-2">
              {issue.kind === "videoDecoderMissing" ? "Sound plays without picture. " : "Picture plays without sound. "}
              Export the file to H.264, HEVC or ProRes, or open it in the software that recorded it.
            </p>
          </div>
        ))}
      </div>

      {!showEmpty && (
        <div
          className={[
            "absolute bottom-0 left-0 z-20 transition-opacity duration-200 ease-(--ease-out-strong)",
            // Compact: a small bar floating in the middle of the bottom edge.
            compactDeck ? "flex justify-center px-3 pb-3 [&>*]:w-[min(760px,100%)]" : "",
            hidden ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          style={{ right: panel ? PANEL_WIDTH : 0 }}
          ref={deckRef}
          onMouseEnter={() => (overControls.current = true)}
          onMouseLeave={() => (overControls.current = false)}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ which: "root", x: e.clientX, y: e.clientY });
          }}
        >
          <ControlBar
            snapshot={s}
            isFullscreen={isFullscreen}
            panel={panel}
            hint={hint}
            onToggleFullscreen={() => void toggleFullscreen()}
            onTogglePanel={(p) => act(p === "queue" ? "view.queue" : "view.inspector")}
            onOpenMenu={(which, anchor) => setMenu((m) => (m?.which === which && m.anchor ? null : { which, anchor }))}
            onError={reportError}
          />
        </div>
      )}

      {panel && (
        <aside
          style={{ width: PANEL_WIDTH }}
          className="absolute inset-y-0 right-0 z-30 border-l border-room-seam bg-room-ply-2 text-room-ink"
          onClick={(e) => e.stopPropagation()}
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

      {menu && (
        <OsdMenu
          nodes={menus[menu.which]}
          label={menuLabel[menu.which]}
          x={menu.x}
          y={menu.y}
          anchor={menu.anchor}
          fromKeyboard={menu.fromKeyboard}
          onClose={closeMenu(setMenu)}
        />
      )}

      <GoToTime
        open={gotoOpen}
        durationMs={s.durationMs}
        positionMs={s.positionMs}
        onClose={() => setGotoOpen(false)}
        onGo={(ms) => {
          setGotoOpen(false);
          run(execute({ type: "seek", positionMs: ms, exact: true }));
        }}
      />
    </main>
  );
}

// Stable identity so the menu's outside-press listener is not re-bound on every snapshot.
const closers = new WeakMap<object, () => void>();
function closeMenu(set: (m: null) => void) {
  let f = closers.get(set);
  if (!f) {
    f = () => set(null);
    closers.set(set, f);
  }
  return f;
}

/** End of the last title: say so, and offer the obvious next moves. */
function EndedCard(props: { title: string | null; next?: string; onReplay: () => void; onNext: () => void; onBrowse: () => void }) {
  return (
    <div
      role="status"
      className="rise absolute bottom-32 left-5 z-20 w-[min(440px,calc(100vw-40px))] rounded-[8px] border border-room-seam bg-room-ply-2 p-5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.85)]"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="flex items-center gap-2">
        <span className="tally" data-state="held" aria-hidden />
        <span className="engrave text-room-ink-3">End of title</span>
      </p>
      {props.title && <p className="spine mt-2 truncate text-[22px] text-room-ink">{props.title}</p>}
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

function GoToTime(props: { open: boolean; durationMs: number | null; positionMs: number; onClose: () => void; onGo: (ms: number) => void }) {
  const [text, setText] = useState("");
  const ms = parseTimeInput(text);
  const tooLong = ms != null && props.durationMs != null && ms > props.durationMs;
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Jump to time"
      description={`Now at ${formatTime(props.positionMs)}${props.durationMs != null ? ` of ${formatTime(props.durationMs)}` : ""}`}
      width="min(380px, calc(100vw - 48px))"
    >
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
          Time
          <input
            data-autofocus
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder="1:02:30"
            aria-invalid={text !== "" && (ms == null || tooLong)}
            aria-describedby="goto-help"
            className="readout mt-1.5 h-10 w-full rounded-[6px] border border-seam-strong bg-paper-raised px-3 text-[16px] text-ink focus:border-ember focus:outline-none"
          />
        </label>
        <p id="goto-help" className={`mt-2 min-h-4 text-[12.5px] ${text && (ms == null || tooLong) ? "text-danger" : "text-ink-3"}`} role={text && (ms == null || tooLong) ? "alert" : undefined}>
          {text && ms == null ? "Use hh:mm:ss, mm:ss, seconds, or 1h2m3s." : tooLong ? "That's past the end of this title." : "hh:mm:ss, mm:ss, seconds, or 1h2m3s"}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={ms == null || tooLong}>
            Jump
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
        <p className="flex items-center gap-2">
          <span className="tally" data-state="idle" aria-hidden />
          <span className="engrave text-room-ink-3">No signal</span>
        </p>
        <h1 className="spine-xl mt-4 text-[64px] text-cream">Nothing playing</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-room-ink-2">Drop a file anywhere in this window, open one, or pick something from your library.</p>
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

function ErrorPanel({
  error,
  fileName,
  onOpen,
  onRetry,
  onBrowse,
}: {
  error: PlaybackError;
  fileName?: string;
  onOpen: () => void;
  onRetry?: () => void;
  onBrowse: () => void;
}) {
  const d = describeError(error);
  return (
    <div className="absolute inset-0 flex items-center bg-room px-[8vw]" role="alert" onClick={(e) => e.stopPropagation()}>
      <div className="max-w-xl">
        <p className="flex items-center gap-2">
          <span className="size-[9px] rounded-[2px] bg-danger-room" aria-hidden />
          <span className="engrave text-room-ink-3">Can't play{fileName ? ` · ${fileName}` : ""}</span>
        </p>
        <h2 className="spine-xl mt-4 text-[48px] text-cream">{d.title}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-room-ink-2">{d.detail}</p>
        <ol className="mt-5 space-y-2 border-l border-room-seam pl-4 text-[14px] text-room-ink">
          {d.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="readout w-4 shrink-0 text-room-ink-3">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <details className="mt-5 text-[12.5px] text-room-ink-3">
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

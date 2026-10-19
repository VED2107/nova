import { Paths } from "expo-file-system";
import * as Thumbs from "expo-video-thumbnails";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type StyleProp, type ViewStyle } from "react-native";
import { languageName } from "@/core/time";
import { MpvView, type MpvState, type MpvTrack, type MpvViewHandle } from "../../modules/nova-mpv/src";
import type { Capabilities, Commands, Fit, Snapshot, Track, VideoFacts } from "./types";

/**
 * NOVA's own engine on Android: libmpv, as on Windows (modules/nova-mpv).
 * Seeks are hr-seeks and report when they land (PLAYBACK_RESTART), so the
 * timeline holds the target until the engine is really there, as on desktop.
 */
export function useMpvEngine(uri: string, startMs: number | null) {
  const ref = useRef<MpvViewHandle>(null);
  const [st, setSt] = useState<MpvState>({});
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [heldMs, setHeldMs] = useState<number | null>(null);
  const settle = useRef(new Set<() => void>());
  const ends = useRef(new Set<() => void>());
  const background = useRef(false);
  const run = (...args: (string | number)[]) => void ref.current?.command(args.map(String)).catch(() => {});
  const set = (name: string, value: string | number) => void ref.current?.setProperty(name, String(value)).catch(() => {});

  const ended = st["eof-reached"] === true;
  // Commands read these through refs, so they stay one stable object (effects depend on it).
  const live = useRef({ ended, timeMs: 0 });
  live.current = { ended, timeMs: Number(st["time-pos"] ?? 0) * 1000 };
  const wasEnded = useRef(false);
  useEffect(() => {
    if (ended && !wasEnded.current) ends.current.forEach((l) => l());
    wasEnded.current = ended;
  }, [ended]);

  // Leaving the app pauses unless background playback is on (desktop has no equivalent).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (a) => {
      if (a === "background" && !background.current) set("pause", "yes");
    });
    return () => sub.remove();
  }, []);

  const seekTo = (ms: number, mode: string) => {
    setHeldMs(ms);
    run("seek", (ms / 1000).toFixed(3), mode);
  };

  const commands: Commands & { setFit(f: Fit): void } = useMemo(
    () => ({
      play: () => (live.current.ended ? (run("seek", 0, "absolute+exact"), set("pause", "no")) : set("pause", "no")),
      pause: () => set("pause", "yes"),
      toggle: () => (live.current.ended ? (run("seek", 0, "absolute+exact"), set("pause", "no")) : run("cycle", "pause")),
      seek: (ms, exact) => seekTo(Math.max(0, ms), exact ? "absolute+exact" : "absolute+keyframes"),
      seekBy: (offset) => {
        setHeldMs(Math.max(0, live.current.timeMs + offset));
        run("seek", (offset / 1000).toFixed(3), "relative+exact");
      },
      setScrubbing: () => {},
      setSpeed: (m) => set("speed", m),
      setMuted: (m) => set("mute", m ? "yes" : "no"),
      setVolume: (v) => {
        set("volume", Math.round(Math.min(1, Math.max(0, v)) * 100));
        if (v > 0) set("mute", "no");
      },
      stop: () => {
        set("pause", "yes");
        seekTo(0, "absolute+exact");
      },
      selectTrack: (kind, id) => set(kind === "audio" ? "aid" : "sid", id ?? "no"),
      setLoop: (on) => set("loop-file", on ? "inf" : "no"),
      replay: () => {
        seekTo(0, "absolute+exact");
        set("pause", "no");
      },
      setSubtitleDelay: (ms) => set("sub-delay", (ms / 1000).toFixed(3)),
      setAudioDelay: (ms) => set("audio-delay", (ms / 1000).toFixed(3)),
      setSubtitleScale: (p) => set("sub-scale", (p / 100).toFixed(2)),
      setSubtitlePosition: (p) => set("sub-pos", Math.round(p)),
      addSubtitle: (u) => run("sub-add", u, "select"),
      frameStep: (forward) => run(forward ? "frame-step" : "frame-back-step"),
      chapter: (d) => run("add", "chapter", d),
      setHardwareDecoding: (on) => set("hwdec", on ? "mediacodec,mediacodec-copy" : "no"),
      setAspect: (r) => set("video-aspect-override", r ?? "no"),
      setRotation: (d) => set("video-rotate", d),
      setFit: (f) => {
        set("keepaspect", f === "fill" ? "no" : "yes");
        set("panscan", f === "cover" ? "1.0" : "0.0");
      },
    }),
    [],
  );

  const tracks: Track[] = ((st.tracks as MpvTrack[] | undefined) ?? [])
    .filter((t) => t.type !== "video")
    .map((t, i) => ({
      id: String(t.id),
      kind: t.type === "audio" ? "audio" : "subtitle",
      label: [t.title, languageName(t.lang), t.external ? "file" : null].filter(Boolean).join(" · ") || `${t.type === "audio" ? "Audio" : "Subtitles"} ${i + 1}`,
      language: t.lang,
      isSelected: t.selected,
    }));
  const w = Number(st["video-params/dw"] ?? 0);
  const gamma = st["video-params/gamma"];
  const video: VideoFacts | null = w
    ? {
        width: w,
        height: Number(st["video-params/dh"] ?? 0),
        frameRate: st["container-fps"] ? Number(st["container-fps"]) : null,
        mimeType: (st["video-format"] as string | undefined) ?? null,
        bitrate: null,
        range: gamma === "pq" ? "HDR10" : gamma === "hlg" ? "HLG" : "SDR",
      }
    : null;
  const seeking = heldMs != null || st.seeking === true;
  const snapshot: Snapshot = {
    phase: failed ? "error" : !loaded || st["paused-for-cache"] === true ? "loading" : seeking ? "seeking" : ended ? "ended" : st.pause === true ? "paused" : "playing",
    positionMs: Number(st["time-pos"] ?? 0) * 1000,
    durationMs: st.duration ? Number(st.duration) * 1000 : null,
    speed: Number(st.speed ?? 1),
    muted: st.mute === true,
    volume: Number(st.volume ?? 100) / 100,
    tracks,
    video,
    error: failed ? "libmpv could not open this file" : null,
    adjust: {
      subtitleDelayMs: Math.round(Number(st["sub-delay"] ?? 0) * 1000),
      audioDelayMs: Math.round(Number(st["audio-delay"] ?? 0) * 1000),
      subtitleScalePercent: Math.round(Number(st["sub-scale"] ?? 1) * 100),
      subtitlePosition: Number(st["sub-pos"] ?? 100),
      hwdec: st["hwdec-current"] && st["hwdec-current"] !== "no" ? String(st["hwdec-current"]) : null,
    },
    chapters: Number(st["chapter-list/count"] ?? 0),
  };

  const capabilities: Capabilities = {
    engine: "libmpv",
    engineDetail: `NOVA engine (libmpv, FFmpeg) · ${snapshot.adjust.hwdec ? `hardware: ${snapshot.adjust.hwdec}` : "software decoding"}`,
    canSeekExact: true,
    reportsSeekCompletion: true,
    canFrameStep: true,
    canSelectTracks: true,
    canStyleSubtitles: true,
    canDelaySubtitles: true,
    canDelayAudio: true,
    canAbLoop: true,
    canPreviewFrames: true,
    canPictureInPicture: false,
    canAddSubtitleFiles: true,
    canChapters: true,
    canHardwareDecodingSwitch: true,
    canBackgroundControls: false,
  };

  const onSettled = useCallback((l: () => void) => {
    settle.current.add(l);
    return () => void settle.current.delete(l);
  }, []);
  const onEnded = useCallback((l: () => void) => {
    ends.current.add(l);
    return () => void ends.current.delete(l);
  }, []);

  const view = (style: StyleProp<ViewStyle>) =>
    MpvView &&
    createElement(MpvView, {
      ref,
      style,
      source: { uri, startMs },
      onState: (e) => setSt((p) => ({ ...p, ...e.nativeEvent })),
      onEngineEvent: ({ nativeEvent: { name } }) => {
        if (name === "loaded") setLoaded(true);
        else if (name === "failed") setFailed(true);
        else if (name === "restart") {
          setHeldMs(null);
          settle.current.forEach((l) => l());
        }
      },
    });

  const screenshot = () => ref.current?.screenshot(`${Paths.cache.uri.replace(/^file:\/\//, "")}/nova-frame.png`) ?? Promise.reject(new Error("No picture yet"));
  const setBackground = (on: boolean) => {
    background.current = on;
  };
  const preview = useMpvPreviews(uri, snapshot.durationMs);

  return { snapshot, commands, capabilities, onSettled, onEnded, view, screenshot, setBackground, preview };
}

/** Timeline previews from Android's MediaMetadataRetriever: 32 frames at even spacing, nearest shown. */
function useMpvPreviews(uri: string, durationMs: number | null, count = 32) {
  const [frames, setFrames] = useState<{ uri: string; ms: number }[]>([]);
  useEffect(() => {
    if (!durationMs) return;
    let cancelled = false;
    (async () => {
      const out: { uri: string; ms: number }[] = [];
      for (let i = 0; i < count && !cancelled; i++) {
        const ms = Math.round((durationMs / count) * (i + 0.5));
        const t = await Thumbs.getThumbnailAsync(uri, { time: ms, quality: 0.5 }).catch(() => null);
        if (!t) return; // the retriever cannot read this container; scrub without pictures
        out.push({ uri: t.uri, ms });
        if (i % 8 === 7) setFrames([...out]);
      }
      if (!cancelled) setFrames(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, durationMs != null]);
  return (ms: number) => {
    if (frames.length === 0) return null;
    const best = frames.reduce((a, f) => (Math.abs(f.ms - ms) < Math.abs(a.ms - ms) ? f : a));
    return { frame: { uri: best.uri }, ms: best.ms };
  };
}

import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, type VideoPlayer, type VideoSource, type VideoThumbnail } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { languageName } from "@/core/time";
import { NO_ADJUST, type Capabilities, type Commands, type Snapshot, type Track, type VideoFacts } from "./types";

/**
 * The platform player behind NOVA's contract: AVPlayer on iOS, Media3
 * (ExoPlayer) on Android, through expo-video, which Expo Go includes.
 *
 * Honest limits of this engine (see docs/architecture/mobile.md):
 * - It plays what the OS plays. On iOS that excludes MKV/WebM containers,
 *   VP9 in most cases, DTS, TrueHD and image-based subtitles.
 * - Seeking is exact (tolerance 0) but there is no "seek landed" event, so a
 *   seek counts as landed at the next time update near the target.
 * - No frame stepping, A–B loop, subtitle styling or delays.
 */
/** A seek with no time update near its target is considered landed after this. */
const SEEK_LAND_FALLBACK_MS = 350;

export function useSystemEngine(source: VideoSource, startMs: number | null) {
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    p.keepScreenOnWhilePlaying = true;
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = false;
    p.audioMixingMode = "doNotMix";
  });

  const { status, error } = useEvent(player, "statusChange", { status: player.status, error: undefined });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { playbackRate } = useEvent(player, "playbackRateChange", { playbackRate: player.playbackRate, oldPlaybackRate: undefined });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted, oldMuted: undefined });
  const { volume } = useEvent(player, "volumeChange", { volume: player.volume, oldVolume: undefined });
  const endListeners = useRef(new Set<() => void>());
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [video, setVideo] = useState<VideoFacts | null>(null);
  /** Pending exact seek: shown as "seeking" until a time update lands near it. */
  const pendingSeek = useRef<{ targetMs: number; at: number; token: object } | null>(null);
  const [seeking, setSeeking] = useState(false);
  const started = useRef(false);
  const settleListeners = useRef(new Set<() => void>());

  const readTracks = (p: VideoPlayer) => {
    const audio = p.availableAudioTracks.map((t, i): Track => ({
      id: t.id ?? `a${i}`,
      kind: "audio",
      label: t.label || t.name || languageName(t.language) || `Audio ${i + 1}`,
      language: t.language || null,
      isSelected: p.audioTrack != null && (p.audioTrack.id ?? p.audioTrack.label) === (t.id ?? t.label),
    }));
    const subs = p.availableSubtitleTracks.map((t, i): Track => ({
      id: t.id ?? `s${i}`,
      kind: "subtitle",
      label: t.label || t.name || languageName(t.language) || `Subtitles ${i + 1}`,
      language: t.language || null,
      isSelected: p.subtitleTrack != null && (p.subtitleTrack.id ?? p.subtitleTrack.label) === (t.id ?? t.label),
    }));
    setTracks([...audio, ...subs]);
    const v = p.videoTrack;
    setVideo(
      v
        ? { width: v.size?.width ?? null, height: v.size?.height ?? null, frameRate: v.frameRate ?? null, mimeType: v.mimeType ?? null, bitrate: v.averageBitrate ?? v.bitrate ?? null, range: v.videoRange ?? null }
        : null,
    );
  };

  useEventListener(player, "sourceLoad", (e) => {
    setDurationMs(e.duration > 0 ? e.duration * 1000 : null);
    readTracks(player);
    if (!started.current) {
      started.current = true;
      if (startMs != null && startMs > 0) player.currentTime = startMs / 1000;
      player.play();
    }
  });
  useEventListener(player, "audioTrackChange", () => readTracks(player));
  useEventListener(player, "subtitleTrackChange", () => readTracks(player));
  useEventListener(player, "availableSubtitleTracksChange", () => readTracks(player));
  useEventListener(player, "videoTrackChange", () => readTracks(player));
  useEventListener(player, "playToEnd", () => {
    setEnded(true);
    endListeners.current.forEach((l) => l());
  });
  const land = (token: object) => {
    if (pendingSeek.current?.token !== token) return;
    pendingSeek.current = null;
    setSeeking(false);
    setPositionMs(player.currentTime * 1000);
    settleListeners.current.forEach((l) => l());
  };
  /** Starts tracking a seek. A paused player may emit no time update, so a timer also lands it. */
  const track = (targetMs: number) => {
    const token = {};
    pendingSeek.current = { targetMs, at: Date.now(), token };
    setSeeking(true);
    setTimeout(() => land(token), SEEK_LAND_FALLBACK_MS);
  };
  useEventListener(player, "timeUpdate", (e) => {
    const ms = e.currentTime * 1000;
    setPositionMs(ms);
    const p = pendingSeek.current;
    // Landed: a time update within 60 ms of the target.
    if (p && Math.abs(ms - p.targetMs) <= 60) land(p.token);
  });
  useEffect(() => {
    if (isPlaying) setEnded(false);
  }, [isPlaying]);

  const commands: Commands = useMemo(
    () => ({
      play: () => (ended ? player.replay() : player.play()),
      pause: () => player.pause(),
      toggle: () => (player.playing ? player.pause() : ended ? player.replay() : player.play()),
      seek: (ms, exact) => {
        player.seekTolerance = exact ? { toleranceBefore: 0, toleranceAfter: 0 } : { toleranceBefore: 2, toleranceAfter: 2 };
        track(ms);
        setEnded(false);
        setPositionMs(ms);
        player.currentTime = ms / 1000;
      },
      seekBy: (offset) => {
        const to = Math.max(0, player.currentTime * 1000 + offset);
        player.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
        track(to);
        setPositionMs(to);
        player.currentTime = to / 1000;
      },
      setScrubbing: (on) => {
        player.scrubbingModeOptions = { scrubbingModeEnabled: on };
      },
      setSpeed: (m) => {
        player.playbackRate = m;
      },
      setMuted: (m) => {
        player.muted = m;
      },
      setVolume: (v) => {
        player.volume = Math.min(1, Math.max(0, v));
        if (v > 0 && player.muted) player.muted = false;
      },
      stop: () => {
        player.pause();
        player.currentTime = 0;
      },
      selectTrack: (kind, id) => {
        if (kind === "audio") {
          const t = player.availableAudioTracks.find((x, i) => (x.id ?? `a${i}`) === id);
          if (t) player.audioTrack = t;
        } else {
          player.subtitleTrack = id == null ? null : (player.availableSubtitleTracks.find((x, i) => (x.id ?? `s${i}`) === id) ?? null);
        }
        readTracks(player);
      },
      setLoop: (on) => {
        player.loop = on;
      },
      replay: () => player.replay(),
    }),
    [player, ended],
  );

  const snapshot: Snapshot = {
    phase:
      status === "error" ? "error" : status === "loading" || status === "idle" ? "loading" : seeking ? "seeking" : ended ? "ended" : isPlaying ? "playing" : "paused",
    positionMs,
    durationMs,
    speed: playbackRate,
    muted,
    volume,
    tracks,
    video,
    error: error?.message ?? null,
    adjust: NO_ADJUST,
    chapters: 0,
  };

  const capabilities: Capabilities = {
    engine: Platform.OS === "ios" ? "AVPlayer" : Platform.OS === "android" ? "Media3 ExoPlayer" : "HTML video",
    engineDetail: "System engine via expo-video (Expo Go)",
    canSeekExact: true,
    reportsSeekCompletion: false,
    canFrameStep: false,
    canSelectTracks: true,
    canStyleSubtitles: false,
    canDelaySubtitles: false,
    canDelayAudio: false,
    canAbLoop: false,
    canPreviewFrames: Platform.OS !== "web",
    canPictureInPicture: Platform.OS !== "web",
    canAddSubtitleFiles: false,
    canChapters: false,
    canHardwareDecodingSwitch: false,
    canBackgroundControls: Platform.OS !== "web",
  };

  /** Subscribe to "a seek landed" (approximate, see above). */
  const onSettled = useCallback((l: () => void) => {
    settleListeners.current.add(l);
    return () => {
      settleListeners.current.delete(l);
    };
  }, []);

  /** Media reached its end (the queue decides what happens next). */
  const onEnded = useCallback((l: () => void) => {
    endListeners.current.add(l);
    return () => {
      endListeners.current.delete(l);
    };
  }, []);

  return { player, snapshot, commands, capabilities, onSettled, onEnded };
}

/**
 * Timeline preview frames from the system engine (iOS and Android). Frames
 * are generated in one batch at evenly spaced times once the media loads,
 * then the nearest one is shown while scrubbing, labelled with its real time.
 */
export function usePreviewFrames(player: VideoPlayer, durationMs: number | null, enabled: boolean, count = 48) {
  const [frames, setFrames] = useState<VideoThumbnail[]>([]);
  useEffect(() => {
    if (!enabled || !durationMs || durationMs <= 0) return;
    let cancelled = false;
    const step = durationMs / 1000 / count;
    const times = Array.from({ length: count }, (_, i) => step * (i + 0.5));
    player
      .generateThumbnailsAsync(times, { maxWidth: 320 })
      .then((t) => !cancelled && setFrames(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [player, durationMs, enabled, count]);

  return (ms: number): { frame: VideoThumbnail; ms: number } | null => {
    if (frames.length === 0) return null;
    let best = frames[0]!;
    for (const f of frames) if (Math.abs(f.requestedTime * 1000 - ms) < Math.abs(best.requestedTime * 1000 - ms)) best = f;
    const real = (Platform.OS === "ios" ? best.actualTime : best.requestedTime) * 1000;
    return { frame: best, ms: real };
  };
}

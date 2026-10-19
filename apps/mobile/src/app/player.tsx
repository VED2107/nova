import * as Brightness from "expo-brightness";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ImageSource } from "expo-image";
import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDownIcon, InfoIcon, LockIcon, MoreIcon, MuteIcon, NextIcon, PauseIcon, PipIcon, PlayIcon, PreviousIcon, QueueIcon, ReplayIcon, RotateIcon, StopIcon, SubtitlesIcon, UnlockIcon, VolumeIcon } from "@/components/icons";
import { Timeline, type ScrubState } from "@/components/Timeline";
import { textStyles, tick } from "@/components/ui";
import { findItem, getLibrary, resumePoint, saveProgress, setFacts, setMissing, setQueue, TEST_CARD, useLibrary, type MediaItem } from "@/core/library";
import { checkExists, uriOf } from "@/core/media";
import { setPref, usePrefs } from "@/core/prefs";
import * as Q from "@/core/queue";
import { startTracks } from "@/core/tracks";
import { accumulate, ScrubSession, scrubRateLabel, tapZone } from "@/core/seek";
import { formatDelta, formatPrecise, formatTime } from "@/core/time";
import { font, motion, room, space, TOUCH } from "@/design/tokens";
import { openFiles } from "@/features/library/actions";
import { PlayerMenu, type MenuContext, type Page } from "@/features/player/PlayerMenu";
import { saveFrame, systemFrame } from "@/playback/snapshot";
import { aspectBox, FIT_LABEL, nextSpeed, type Capabilities, type Commands, type Fit, type Snapshot } from "@/playback/types";
import { useMpvEngine } from "@/playback/useMpvEngine";
import { usePreviewFrames, useSystemEngine } from "@/playback/useSystemEngine";
import { mpvAvailable } from "../../modules/nova-mpv/src";

/** What the player surface needs from an engine, whichever it is. */
interface Engine {
  snapshot: Snapshot;
  commands: Commands;
  capabilities: Capabilities;
  onSettled(l: () => void): () => void;
  onEnded(l: () => void): () => void;
  view(style: StyleProp<ViewStyle>, fit: Fit): ReactNode;
  preview(ms: number): { frame: ImageSource; ms: number } | null;
  setBackground(on: boolean): void;
  grabFrame(positionMs: number): Promise<string>;
  pip?(): Promise<void>;
}

/** One route; each title is its own session (the engine is rebuilt per title, like desktop's sessions). */
export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lib = useLibrary();
  const item = findItem(id ?? "", lib) ?? TEST_CARD;
  // A file libmpv could not open can be retried with the phone's own player.
  const [systemFor, setSystemFor] = useState<string | null>(null);
  return <Session key={`${item.id}:${systemFor === item.id}`} item={item} forceSystem={systemFor === item.id} onFallback={() => setSystemFor(item.id)} />;
}

function Session({ item, forceSystem, onFallback }: { item: MediaItem; forceSystem: boolean; onFallback: () => void }) {
  const prefs = usePrefs();
  const [startAt] = useState(() => (prefs.resume === "on" ? resumePoint(getLibrary().progress[item.id]) : null));
  // Android plays through NOVA's libmpv engine, as Windows does; Expo Go and iOS use the system player.
  const [nova] = useState(() => mpvAvailable && prefs.engine === "nova" && !forceSystem);
  const [uri, setUri] = useState<string | null>(typeof item.source === "string" ? item.source : null);
  useEffect(() => {
    if (nova && uri == null) uriOf(item).then(setUri, () => setUri(""));
  }, []);
  if (!nova) return <SystemSession item={item} startAt={startAt} />;
  if (uri == null) return <View style={styles.root} />;
  return <MpvSession item={item} uri={uri} startAt={startAt} onFallback={onFallback} />;
}

function SystemSession({ item, startAt }: { item: MediaItem; startAt: number | null }) {
  // Title in the media notification and on headphones/lock screen (background playback).
  const metadata = { title: item.title, artist: "NOVA" };
  const source = typeof item.source === "number" ? { assetId: item.source, metadata } : { uri: item.source, metadata };
  const e = useSystemEngine(source, startAt);
  const videoRef = useRef<VideoView>(null);
  const preview = usePreviewFrames(e.player, e.snapshot.durationMs, e.capabilities.canPreviewFrames);
  const engine: Engine = {
    ...e,
    view: (style, fit) => <VideoView ref={videoRef} player={e.player} style={style} contentFit={fit} nativeControls={false} allowsPictureInPicture={e.capabilities.canPictureInPicture} />,
    preview,
    setBackground: (on) => {
      e.player.staysActiveInBackground = on;
      e.player.showNowPlayingNotification = on;
    },
    grabFrame: (ms) => systemFrame(e.player, ms),
    pip: () => videoRef.current?.startPictureInPicture() ?? Promise.reject(new Error("unavailable")),
  };
  return <Surface item={item} engine={engine} resumedAt={startAt} />;
}

function MpvSession({ item, uri, startAt, onFallback }: { item: MediaItem; uri: string; startAt: number | null; onFallback: () => void }) {
  const e = useMpvEngine(uri, startAt);
  const engine: Engine = { ...e, view: (style) => e.view(style), grabFrame: () => e.screenshot() };
  return <Surface item={item} engine={engine} resumedAt={startAt} onFallback={onFallback} />;
}

function Surface({ item, engine, resumedAt, onFallback }: { item: MediaItem; engine: Engine; resumedAt: number | null; onFallback?: () => void }) {
  const { snapshot: s, commands, capabilities: caps, onSettled, onEnded } = engine;
  const router = useRouter();
  const prefs = usePrefs();
  const lib = useLibrary();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const stepMs = Number(prefs.seekStep) * 1000;

  const [controls, setControls] = useState(true);
  const [locked, setLocked] = useState(false);
  const [page, setPage] = useState<Page>(null);
  const [scrub, setScrub] = useState<ScrubState | null>(null);
  const [heldMs, setHeldMs] = useState<number | null>(null);
  const [burst, setBurst] = useState<{ side: "back" | "forward"; totalMs: number; key: number } | null>(null);
  const [osd, setOsd] = useState<string | null>(null);
  const [ab, setAb] = useState<Q.AbLoop>({ aMs: null, bMs: null });
  const [fit, setFit] = useState<Fit>("contain");
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<string | null>(null);
  const [resumeNote, setResumeNote] = useState(resumedAt != null);
  const session = useRef<ScrubSession | null>(null);
  const scrubStart = useRef(0);
  const wasPlaying = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const burstRef = useRef<{ side: "back" | "forward"; totalMs: number; key: number } | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const swipe = useRef<{ kind: "volume" | "brightness"; start: number } | null>(null);
  const brightness = useRef<{ initial: number | null; value: number }>({ initial: null, value: 0.5 });
  const preview = engine.preview;
  /** libmpv shapes the picture itself (aspect, rotation, zoom); the system view is transformed instead. */
  const engineShapes = commands.setAspect != null;
  const playing = s.phase === "playing" || (s.phase === "seeking" && wasPlaying.current);
  const remaining = prefs.timeDisplay === "remaining" && s.durationMs != null;

  const flash = useCallback((text: string) => {
    setOsd(text);
    clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), 1100);
  }, []);

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    if (prefs.autoHide === "on") hideTimer.current = setTimeout(() => setControls(false), Number(prefs.hideDelay) * 1000);
  }, [prefs.autoHide, prefs.hideDelay]);
  useEffect(() => {
    if (!playing || scrub || page) {
      clearTimeout(hideTimer.current);
      if (!playing || page) setControls(true);
    } else poke();
    return () => clearTimeout(hideTimer.current);
  }, [playing, scrub != null, page, poke]);

  /* ---------- persistence: position, learned facts, missing files ---------- */
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    const save = () => {
      const x = latest.current;
      if (x.durationMs && x.phase !== "ended") saveProgress(item.id, x.positionMs, x.durationMs);
    };
    const t = setInterval(save, 5000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [item.id]);
  useEffect(() => {
    if (s.video) setFacts(item.id, { width: s.video.width, height: s.video.height, frameRate: s.video.frameRate });
  }, [item.id, s.video?.width, s.video?.height, s.video?.frameRate]);
  useEffect(() => {
    if (s.phase === "error") checkExists(item);
    else if (s.phase === "playing") setMissing(item.id, false);
  }, [s.phase, item]);
  useEffect(() => {
    if (!resumeNote) return;
    const t = setTimeout(() => setResumeNote(false), 5000);
    return () => clearTimeout(t);
  }, [resumeNote]);

  /* ---------- background playback and media notification (desktop: media keys) ---------- */
  useEffect(() => {
    engine.setBackground(prefs.background === "on" && Platform.OS !== "web");
  }, [prefs.background]);

  /* ---------- engine-side settings (libmpv): as on desktop, saved values apply to every file ---------- */
  const ready = s.phase !== "loading" || s.durationMs != null;
  useEffect(() => {
    if (ready) commands.setSubtitleScale?.(Number(prefs.subScale));
  }, [ready, prefs.subScale]);
  useEffect(() => {
    if (ready) commands.setHardwareDecoding?.(prefs.hwdec === "auto");
  }, [ready, prefs.hwdec]);

  /* ---------- opening: orientation and preferred tracks ---------- */
  useEffect(() => {
    const lock = { landscape: ScreenOrientation.OrientationLock.LANDSCAPE, portrait: ScreenOrientation.OrientationLock.PORTRAIT_UP, auto: null }[prefs.orientation];
    if (lock != null && Platform.OS !== "web") void ScreenOrientation.lockAsync(lock).catch(() => {});
  }, []);
  const tracksChosen = useRef(false);
  useEffect(() => {
    if (tracksChosen.current || s.tracks.length === 0) return;
    tracksChosen.current = true;
    const pick = startTracks(s.tracks, prefs, Intl.DateTimeFormat().resolvedOptions().locale);
    if (pick.audio) commands.selectTrack("audio", pick.audio);
    if (pick.subtitle !== undefined) commands.selectTrack("subtitle", pick.subtitle);
  }, [s.tracks]);

  /* ---------- leaving: free rotation, give brightness back ---------- */
  useEffect(
    () => () => {
      void ScreenOrientation.unlockAsync().catch(() => {});
      const b = brightness.current.initial;
      if (b != null) {
        if (Platform.OS === "android") void Brightness.restoreSystemBrightnessAsync().catch(() => {});
        else void Brightness.setBrightnessAsync(b).catch(() => {});
      }
    },
    [],
  );

  /* ---------- queue: repeat one, auto-advance, next/previous ---------- */
  useEffect(() => commands.setLoop(lib.queue.repeat === "one"), [lib.queue.repeat, commands]);
  const goTo = useCallback(
    (index: number) => {
      const q = getLibrary().queue;
      const id = q.ids[index];
      if (!id) return;
      setQueue({ ...q, index });
      router.setParams({ id });
    },
    [router],
  );
  useEffect(
    () =>
      onEnded(() => {
        const q = getLibrary().queue;
        const d = latest.current.durationMs ?? 0;
        saveProgress(item.id, d, d); // finished: the resume rule starts it over next time
        const n = Q.nextIndex(q, true);
        if (n != null && n !== q.index) goTo(n);
      }),
    [onEnded, goTo, item.id],
  );
  const next = () => {
    const n = Q.nextIndex(getLibrary().queue, false);
    if (n == null) return flash("End of the queue");
    goTo(n);
  };
  const previous = () => {
    const q = getLibrary().queue;
    const p = Q.previousIndex(q, s.positionMs);
    if (p == null || p === q.index) return commands.seek(0, true);
    goTo(p);
  };

  /* ---------- A–B loop (driven here; the system engine has none) ---------- */
  useEffect(() => {
    const to = Q.abWrap(ab, s.positionMs);
    if (to != null && s.phase === "playing") commands.seek(to, true);
  }, [s.positionMs, ab, s.phase, commands]);
  const abCycle = () => {
    const n = Q.cycleAb(ab, s.positionMs);
    setAb(n);
    flash(n.aMs == null ? "A–B loop off" : n.bMs == null ? `A ${formatTime(n.aMs)}` : `Loop ${formatTime(n.aMs)}–${formatTime(n.bMs)}`);
  };

  /* ---------- seeking ---------- */
  useEffect(() => {
    const off = onSettled(() => {
      const x = session.current;
      if (x && x.settled()) {
        session.current = null;
        setHeldMs(null);
      }
    });
    return () => {
      off();
    };
  }, [onSettled]);
  const send = (req: { positionMs: number; exact: boolean }) => commands.seek(req.positionMs, req.exact);
  const onScrubStart = (st: ScrubState) => {
    wasPlaying.current = s.phase === "playing";
    if (wasPlaying.current) commands.pause(); // the system players scrub best paused
    commands.setScrubbing(true);
    scrubStart.current = s.positionMs;
    session.current = new ScrubSession(send, s.durationMs ?? 0, prefs.scrub);
    session.current.move(st.ms);
    setScrub(st);
    setHeldMs(st.ms);
  };
  const onScrub = (st: ScrubState) => {
    setScrub(st);
    setHeldMs(st.ms);
    session.current?.move(st.ms);
  };
  const onScrubEnd = (st: ScrubState) => {
    commands.setScrubbing(false);
    setScrub(null);
    setHeldMs(st.ms);
    session.current?.release(st.ms);
    tick("select");
    if (wasPlaying.current) commands.play();
  };
  const step = (offset: number) => {
    commands.seekBy(offset);
    poke();
  };
  const frame = (forward: boolean) => {
    if (commands.frameStep) {
      commands.pause();
      commands.frameStep(forward);
      return flash(forward ? "Next frame" : "Previous frame");
    }
    const t = Q.frameStepTarget(s.positionMs, s.video?.frameRate ?? null, forward);
    if (t == null) return;
    commands.pause();
    commands.seek(t, true);
    flash(forward ? "Next frame" : "Previous frame");
  };

  /* ---------- gestures on the picture ---------- */
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .runOnJS(true)
    .onEnd((e) => {
      const zone = tapZone(e.x, width);
      if (zone === "middle" || locked) return;
      tick("light");
      const prev = burstRef.current;
      const n = { ...accumulate(prev && Date.now() - prev.key < 900 ? prev : null, zone, stepMs), key: Date.now() };
      burstRef.current = n;
      setBurst(n);
      commands.seekBy(zone === "back" ? -stepMs : stepMs);
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => {
        burstRef.current = null;
        setBurst(null);
      }, 700);
      if (prefs.gestureHintSeen === "no") setPref("gestureHintSeen", "yes");
    });
  const singleTap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      if (prefs.tapAction === "pause" && !locked) {
        tick("light");
        commands.toggle();
        poke();
      } else if (controls && playing && !locked) {
        clearTimeout(hideTimer.current);
        setControls(false);
      } else poke();
    });
  // Vertical swipes: right half = NOVA's volume, left half = screen brightness (given back on exit).
  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-14, 14])
    .failOffsetX([-24, 24])
    .enabled(!locked && prefs.swipeGestures === "on")
    .onBegin((e) => {
      const kind = e.x > width / 2 ? "volume" : "brightness";
      if (kind === "brightness" && brightness.current.initial == null) {
        void Brightness.getBrightnessAsync()
          .then((b) => {
            brightness.current = { initial: b, value: b };
            if (swipe.current?.kind === "brightness") swipe.current.start = b;
          })
          .catch(() => {});
      }
      swipe.current = { kind, start: kind === "volume" ? s.volume : brightness.current.value };
    })
    .onUpdate((e) => {
      const sw = swipe.current;
      if (!sw) return;
      const v = Math.min(1, Math.max(0, sw.start - e.translationY / (height * SWIPE_SPAN[prefs.swipeSensitivity])));
      if (sw.kind === "volume") {
        commands.setVolume(v);
        flash(`Volume ${Math.round(v * 100)} %`);
      } else {
        brightness.current.value = v;
        void Brightness.setBrightnessAsync(v).catch(() => {});
        flash(`Brightness ${Math.round(v * 100)} %`);
      }
    })
    .onFinalize(() => {
      swipe.current = null;
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .enabled(!locked)
    .onEnd((e) => {
      const nf: Fit | null = e.scale > 1.12 ? "cover" : e.scale < 0.9 ? "contain" : null;
      if (nf && nf !== fit) {
        setAspect(null);
        setFit(nf);
        flash(FIT_LABEL[nf]);
        tick();
      }
    });
  const taps = prefs.doubleTapSeek === "on" ? Gesture.Exclusive(doubleTap, singleTap) : singleTap;
  const surfaceGesture = Gesture.Race(pinch, swipeGesture, taps);

  useEffect(() => {
    if (!engineShapes) return;
    commands.setFit?.(fit);
    commands.setAspect?.(aspect);
    commands.setRotation?.(rotation);
  }, [engineShapes, fit, aspect, rotation, ready]);

  /* ---------- small actions ---------- */
  const toggleRotation = async () => {
    tick();
    const o = await ScreenOrientation.getOrientationAsync();
    const isLand = o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
    await ScreenOrientation.lockAsync(isLand ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  };
  const cycleTrack = (kind: "audio" | "subtitle") => {
    const list = s.tracks.filter((t) => t.kind === kind);
    if (list.length === 0) return flash(kind === "audio" ? "No audio tracks" : "No subtitles");
    const i = list.findIndex((t) => t.isSelected);
    const nextId = kind === "subtitle" ? (i === list.length - 1 ? null : list[i + 1]!.id) : list[(i + 1) % list.length]!.id;
    commands.selectTrack(kind, nextId);
    const label = nextId == null ? "Off" : list.find((t) => t.id === nextId)?.label;
    flash(`${kind === "audio" ? "Audio" : "Subtitles"}: ${label}`);
  };

  const ctx: MenuContext = {
    item,
    s,
    caps,
    playing,
    ab,
    fit,
    aspect,
    rotation,
    remaining,
    act: {
      toggle: () => commands.toggle(),
      stop: () => commands.stop(),
      seek: (ms) => commands.seek(ms, true),
      speed: (v) => {
        commands.setSpeed(v);
        flash(`Speed ${v}×`);
      },
      abCycle,
      frame,
      track: (k, id) => commands.selectTrack(k, id),
      mute: () => {
        commands.setMuted(!s.muted);
        flash(s.muted ? "Sound on" : "Muted");
      },
      fit: (f) => {
        setAspect(null);
        setFit(f);
        flash(FIT_LABEL[f]);
      },
      rotate: () => setRotation((r) => (r + 90) % 360),
      setRotation: (d) => {
        setRotation(d);
        flash(d === 0 ? "No rotation" : `Rotated ${d}°`);
      },
      aspect: (r) => {
        setAspect(r);
        if (r) setFit("fill");
        else setFit("contain");
        flash(r ? `Aspect ${r}` : "Aspect as encoded");
      },
      seekBy: (ms) => {
        commands.seekBy(ms);
        flash(`${ms > 0 ? "+" : "−"}${formatTime(Math.abs(ms))}`);
      },
      volume: (delta) => {
        const v = Math.min(1, Math.max(0, (s.muted ? 0 : s.volume) + delta));
        commands.setVolume(v);
        flash(`Volume ${Math.round(v * 100)} %`);
      },
      snapshot: () => {
        flash("Saving frame…");
        saveFrame(() => engine.grabFrame(s.positionMs), s.positionMs, item.title)
          .then(flash)
          .catch((e) => flash(e instanceof Error ? `Not saved: ${e.message}` : "Not saved"));
      },
      openFile: () => void openFiles(),
      library: () => router.back(),
      pip: () => void (engine.pip?.() ?? Promise.reject()).catch(() => flash("Picture in picture is not available")),
      lock: () => {
        tick("medium");
        setLocked(true);
      },
      rotateScreen: () => void toggleRotation(),
      next,
      previous,
      jump: (id) => goTo(getLibrary().queue.ids.indexOf(id)),
      subDelay: (d) => {
        const v = d == null ? 0 : s.adjust.subtitleDelayMs + d;
        commands.setSubtitleDelay?.(v);
        flash(`Subtitle delay ${v > 0 ? "+" : ""}${v} ms`);
      },
      audioDelay: (d) => {
        const v = d == null ? 0 : s.adjust.audioDelayMs + d;
        commands.setAudioDelay?.(v);
        flash(`Audio delay ${v > 0 ? "+" : ""}${v} ms`);
      },
      subScale: (d) => {
        const v = d == null ? 100 : Math.min(300, Math.max(50, Number(prefs.subScale) + d));
        setPref("subScale", String(v));
        flash(`Subtitle size ${v}%`);
      },
      addSubtitle: () =>
        void DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
          .then((r) => {
            const a = r.canceled ? null : r.assets?.[0];
            if (!a) return;
            commands.addSubtitle?.(a.uri);
            flash(`Subtitles: ${a.name}`);
          })
          .catch(() => flash("The subtitle file could not be opened")),
      chapter: (d) => {
        commands.chapter?.(d);
        flash(d > 0 ? "Next chapter" : "Previous chapter");
      },
      hwdec: (on) => {
        setPref("hwdec", on ? "auto" : "off");
        flash(on ? "Hardware decoding on" : "Hardware decoding off");
      },
    },
  };

  const audio = s.tracks.filter((t) => t.kind === "audio");
  const subs = s.tracks.filter((t) => t.kind === "subtitle");
  const subOn = subs.find((t) => t.isSelected);
  const audioOn = audio.findIndex((t) => t.isSelected);
  const shownTime = heldMs ?? s.positionMs;
  const prev = scrub ? preview(scrub.ms) : null;
  const fps = s.video?.frameRate ?? null;
  const pad = { top: insets.top + space.xs, left: Math.max(insets.left, space.l), right: Math.max(insets.right, space.l), bottom: Math.max(insets.bottom, space.s) };
  const showChrome = controls && !locked;
  const state = { playing: "Playing", paused: "Paused", loading: "Loading", seeking: "Seeking", ended: "Ended", idle: "Idle", error: "Error" }[s.phase];
  const tally = [s.video?.width ? `${s.video.width}×${s.video.height}` : null, fps ? `${Math.round(fps * 100) / 100} fps` : null, caps.engine].filter(Boolean).join(" · ");
  const rotated = rotation % 180 !== 0;

  const readouts = (
    <View style={styles.readouts}>
      <Readout label="Speed" value={`${s.speed}×`} on={s.speed !== 1} onPress={() => setPage("speed")} onLong={() => ctx.act.speed(nextSpeed(s.speed, 1))} />
      <Readout label="Audio" value={audio.length ? `#${audioOn + 1}` : "—"} onPress={() => cycleTrack("audio")} onLong={() => setPage("tracks")} />
      <Readout label="Subtitles" value={subOn ? (subOn.language ?? subOn.label).slice(0, 3).toUpperCase() : "Off"} on={!!subOn} onPress={() => cycleTrack("subtitle")} onLong={() => setPage("tracks")} />
      <Readout label="A–B" value={ab.aMs == null ? "Off" : ab.bMs == null ? "A" : "On"} on={ab.aMs != null} onPress={abCycle} />
    </View>
  );
  const volume = (
    <View style={styles.inline}>
      <Ctl label={s.muted ? "Unmute" : "Mute"} onPress={ctx.act.mute}>
        {s.muted || s.volume === 0 ? <MuteIcon color={room.ink} size={22} /> : <VolumeIcon color={room.ink} size={22} />}
      </Ctl>
      <VolumeBar value={s.muted ? 0 : s.volume} onChange={(v) => commands.setVolume(v)} width={landscape ? 84 : 60} />
      {landscape && <Text style={[textStyles.readout, { color: room.ink2, width: 30, fontSize: 12, marginLeft: space.s }]}>{Math.round((s.muted ? 0 : s.volume) * 100)}</Text>}
    </View>
  );
  const tools = (
    <View style={styles.inline}>
      <Ctl label="Queue" onPress={() => setPage("queue")}>
        <QueueIcon color={room.ink} size={22} />
      </Ctl>
      <Ctl label="Playback information" onPress={() => setPage("info")}>
        <InfoIcon color={room.ink} size={22} />
      </Ctl>
      <Ctl label={`Audio and subtitles${subOn ? `, subtitles ${subOn.label}` : ""}`} onPress={() => setPage("tracks")}>
        <SubtitlesIcon color={subOn ? room.ember : room.ink} size={22} />
      </Ctl>
      <Ctl label="All player tools" onPress={() => setPage("menu")}>
        <MoreIcon color={room.ink} size={22} />
      </Ctl>
    </View>
  );

  const compact = prefs.controlBar === "compact";
  const busy = s.phase === "loading" || (s.phase === "seeking" && !scrub);
  const playButton = (h: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? "Loading" : s.phase === "ended" ? "Play again" : playing ? "Pause" : "Play"}
      accessibilityState={{ busy }}
      onPress={() => {
        tick("light");
        commands.toggle();
        poke();
      }}
      hitSlop={(TOUCH - h) / 2}
      style={({ pressed }) => [styles.play, { height: h, width: h + 4 }, pressed && { opacity: 0.85 }]}
    >
      {busy ? <ActivityIndicator color={room.bg} /> : s.phase === "ended" ? <ReplayIcon color={room.bg} size={24} /> : playing ? <PauseIcon color={room.bg} size={24} /> : <PlayIcon color={room.bg} size={24} />}
    </Pressable>
  );
  const timeline = <Timeline positionMs={s.positionMs} durationMs={s.durationMs} heldMs={heldMs} abLoop={ab} disabled={s.phase === "error" || s.phase === "loading"} stepMs={stepMs} onScrubStart={onScrubStart} onScrub={onScrub} onScrubEnd={onScrubEnd} onStep={step} />;
  const totalTime = (
    <Pressable accessibilityRole="button" accessibilityLabel={remaining ? "Show total length" : "Show time remaining"} onPress={() => setPref("timeDisplay", remaining ? "elapsed" : "remaining")} hitSlop={10}>
      <Text style={[textStyles.readout, compact ? styles.timeC : styles.timeR]}>{remaining ? `−${formatTime(Math.max(0, (s.durationMs ?? 0) - shownTime))}` : formatTime(s.durationMs)}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <StatusBar hidden={!showChrome || landscape} style="light" animated />
      <GestureDetector gesture={surfaceGesture}>
        <View style={StyleSheet.absoluteFill} accessible={false} collapsable={false}>
          <View style={engineShapes ? StyleSheet.absoluteFill : rotated ? { position: "absolute", width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: [{ rotate: `${rotation}deg` }] } : [StyleSheet.absoluteFill, { transform: [{ rotate: `${rotation}deg` }] }]}>
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              {engine.view(aspect && !engineShapes ? aspectBox(aspect, rotated ? height : width, rotated ? width : height) : StyleSheet.absoluteFill, fit)}
            </View>
          </View>
        </View>
      </GestureDetector>

      {burst && (
        <Animated.View key={burst.key} entering={FadeIn.duration(90)} exiting={FadeOut.duration(220)} pointerEvents="none" style={[styles.burst, burst.side === "back" ? { left: 0 } : { right: 0 }]}>
          <View style={[styles.burstWash, burst.side === "back" ? { borderTopRightRadius: height, borderBottomRightRadius: height } : { borderTopLeftRadius: height, borderBottomLeftRadius: height }]} />
          <Text style={styles.burstText}>
            {burst.side === "back" ? "−" : "+"}
            {Math.round(burst.totalMs / 1000)} s
          </Text>
        </Animated.View>
      )}

      {osd && (
        <Animated.View entering={FadeIn.duration(90)} exiting={FadeOut.duration(200)} pointerEvents="none" style={[styles.osd, { top: pad.top + 64 }]}>
          <Text style={[textStyles.readout, { color: room.ink, fontSize: 15 }]}>{osd}</Text>
        </Animated.View>
      )}

      {s.phase === "error" && (
        <View style={styles.errorBox}>
          <Text style={[textStyles.engrave, { color: room.danger }]}>{lib.missing[item.id] ? "File missing" : "Cannot play"}</Text>
          <Text style={[textStyles.title, styles.errorTitle]}>{lib.missing[item.id] ? "This file is no longer where NOVA saw it" : "This file can’t be played here"}</Text>
          <Text style={[textStyles.body, { color: room.ink2, marginTop: space.s, textAlign: "center" }]}>
            {lib.missing[item.id]
              ? "It was moved, deleted, or its folder is no longer shared with NOVA. Add the folder again or open the file from Files."
              : caps.engine === "libmpv"
                ? "NOVA's engine could not open it. The file may be damaged, protected, or a format no engine supports. The phone's own player can be tried instead."
                : `${caps.engine} could not open it${s.error ? ` (${s.error})` : ""}. Containers such as MKV or WebM on iPhone, and codecs such as DTS or TrueHD, need the NOVA engine.`}
          </Text>
          <View style={{ flexDirection: "row", gap: space.m, marginTop: space.xl }}>
            {onFallback && !lib.missing[item.id] && (
              <Pressable onPress={onFallback} style={[styles.errorBtn, styles.errorBtnPlain]} accessibilityRole="button">
                <Text style={[textStyles.label, { color: room.ink, fontFamily: font.semibold }]}>Try the phone's player</Text>
              </Pressable>
            )}
            {Q.nextIndex(lib.queue, false) != null && (
              <Pressable onPress={next} style={[styles.errorBtn, styles.errorBtnPlain]} accessibilityRole="button">
                <Text style={[textStyles.label, { color: room.ink, fontFamily: font.semibold }]}>Skip to next</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.back()} style={styles.errorBtn} accessibilityRole="button">
              <Text style={[textStyles.label, { color: room.bg, fontFamily: font.semibold }]}>Back to library</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showChrome && (
        <Animated.View entering={FadeIn.duration(motion.quick)} exiting={FadeOut.duration(motion.base)} pointerEvents="box-none" style={[styles.header, { paddingTop: pad.top, paddingLeft: pad.left - space.s, paddingRight: pad.right - space.s }]}>
          <Ctl label="Back to library" onPress={() => router.back()}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <ChevronDownIcon color={room.ink} size={24} />
            </View>
          </Ctl>
          <View style={{ flex: 1, paddingHorizontal: space.xs }}>
            <Text numberOfLines={1} style={[textStyles.title, { color: room.ink, fontFamily: font.spine, fontSize: 19 }]}>
              {item.title}
            </Text>
            <View style={styles.tallyRow}>
              <View style={[styles.lamp, { backgroundColor: s.phase === "playing" ? room.ember : s.phase === "error" ? room.danger : room.ink3 }]} />
              <Text style={[textStyles.engrave, { color: room.ink2, fontSize: 9.5 }]}>{state}</Text>
              <Text numberOfLines={1} style={[textStyles.caption, { color: room.ink3, flex: 1 }]}>
                · {tally}
              </Text>
            </View>
          </View>
          {!compact && (
            <Ctl label="Lock controls" onPress={ctx.act.lock}>
              <LockIcon color={room.ink} size={22} />
            </Ctl>
          )}
          {!compact && caps.canPictureInPicture && (
            <Ctl label="Picture in picture" onPress={ctx.act.pip}>
              <PipIcon color={room.ink} size={22} />
            </Ctl>
          )}
          {!compact && Platform.OS !== "web" && (
            <Ctl label={landscape ? "Rotate to portrait" : "Rotate to landscape"} onPress={toggleRotation}>
              <RotateIcon color={room.ink} size={22} />
            </Ctl>
          )}
        </Animated.View>
      )}

      {(showChrome || scrub) && (
        <View pointerEvents="box-none" style={compact ? [styles.compactDeck, { left: pad.left, right: pad.right, bottom: pad.bottom + space.xs }] : [styles.deck, { paddingLeft: pad.left, paddingRight: pad.right, paddingBottom: pad.bottom }]}>
          {scrub && (
            <View pointerEvents="none" style={[styles.bubble, { bottom: compact ? 64 : 150, left: Math.min(Math.max(0, scrub.fraction * (width - pad.left - pad.right) - 92), width - pad.left - pad.right - 184) }]}>
              {prev && <Image source={prev.frame} style={styles.bubbleImg} contentFit="cover" />}
              <View style={styles.bubbleText}>
                <Text style={[textStyles.readout, { color: room.ink, fontSize: 15 }]}>{formatPrecise(scrub.ms, fps)}</Text>
                <Text style={[textStyles.readout, { color: room.ember, fontSize: 12 }]}>{formatDelta(scrub.ms - scrubStart.current)}</Text>
              </View>
              {prev && Math.abs(prev.ms - scrub.ms) > 500 && <Text style={styles.bubbleNote}>Nearest preview · {formatTime(prev.ms)}</Text>}
              {scrubRateLabel(scrub.rate) && <Text style={styles.bubbleNote}>{scrubRateLabel(scrub.rate)}</Text>}
            </View>
          )}

          {!scrub && prefs.gestureHintSeen === "no" && prefs.doubleTapSeek === "on" && (
            <Pressable onPress={() => setPref("gestureHintSeen", "yes")} style={styles.hint} accessibilityRole="button" accessibilityLabel="Gesture tips. Dismiss">
              <Text style={[textStyles.caption, { color: room.ink2 }]}>
                Double-tap a side to skip {prefs.seekStep} s · swipe up/down: volume (right), brightness (left) · pinch to fill · slide up while scrubbing for fine control
              </Text>
            </Pressable>
          )}

          {resumeNote && resumedAt != null && !scrub && (
            <View style={styles.resume}>
              <Text style={[textStyles.label, { color: room.ink }]}>Resumed at {formatTime(resumedAt)}</Text>
              <Pressable onPress={() => { commands.seek(0, true); setResumeNote(false); }} accessibilityRole="button" hitSlop={10}>
                <Text style={[textStyles.label, { color: room.ember, fontFamily: font.semibold }]}>Start over</Text>
              </Pressable>
            </View>
          )}

          {compact ? (
            // Compact: one floating row; everything else is one tap away in More.
            <View style={styles.compactRow}>
              {!scrub && playButton(40)}
              <Text style={[textStyles.readout, styles.timeC]}>{formatTime(shownTime)}</Text>
              <View style={{ flex: 1 }}>{timeline}</View>
              {totalTime}
              {!scrub && (
                <Ctl label="All player tools" onPress={() => setPage("menu")}>
                  <MoreIcon color={room.ink} size={22} />
                </Ctl>
              )}
            </View>
          ) : (
            <>
              {/* Timeline row, as on desktop: elapsed · bar · total (tap to show remaining). */}
              <View style={styles.timeRow}>
                <Text style={[textStyles.readout, styles.timeL]}>{formatTime(shownTime)}</Text>
                <View style={{ flex: 1 }}>{timeline}</View>
                {totalTime}
              </View>

              {!scrub && (
                <>
                  <View style={styles.row}>
                    {playButton(44)}
                    <Ctl label="Stop" onPress={ctx.act.stop}>
                      <StopIcon color={room.ink} size={20} />
                    </Ctl>
                    <Ctl label="Previous" onPress={previous}>
                      <PreviousIcon color={room.ink} size={22} />
                    </Ctl>
                    <Ctl label="Next" onPress={next}>
                      <NextIcon color={room.ink} size={22} />
                    </Ctl>
                    {landscape ? (
                      <>
                        <View style={styles.divider} />
                        {volume}
                        <View style={{ flex: 1 }} />
                        {readouts}
                        <View style={styles.divider} />
                        {tools}
                      </>
                    ) : (
                      <>
                        <View style={{ flex: 1 }} />
                        {tools}
                      </>
                    )}
                  </View>
                  {!landscape && (
                    <View style={[styles.row, { marginTop: 2 }]}>
                      {volume}
                      <View style={{ flex: 1 }} />
                      {readouts}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
      )}

      {locked && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", alignItems: "center", paddingBottom: pad.bottom + space.xl }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Unlock controls" accessibilityHint="Long press to unlock" onLongPress={() => { tick("medium"); setLocked(false); poke(); }} delayLongPress={450} style={styles.unlock}>
            <UnlockIcon color={room.ink} size={22} />
            <Text style={[textStyles.label, { color: room.ink2 }]}>Hold to unlock</Text>
          </Pressable>
        </View>
      )}

      <PlayerMenu page={page} setPage={setPage} ctx={ctx} />
    </View>
  );
}

/** Share of the screen height a swipe travels for 0 → 100 %. */
const SWIPE_SPAN = { low: 0.9, normal: 0.6, high: 0.35 } as const;

/** Desktop's readout keys: an engraved label over the current value. Tap acts, long-press opens the list. */
function Readout({ label, value, on, onPress, onLong }: { label: string; value: string; on?: boolean; onPress: () => void; onLong?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={() => { tick(); onPress(); }} onLongPress={onLong} style={({ pressed }) => [styles.readout, pressed && { backgroundColor: "rgba(242,239,232,0.10)" }]}>
      <Text style={[textStyles.engrave, { color: room.ink3, fontSize: 9 }]}>{label}</Text>
      <Text style={[textStyles.readout, { color: on ? room.ember : room.ink, fontFamily: font.semibold, fontSize: 13 }]}>{value}</Text>
    </Pressable>
  );
}

/** NOVA's volume bar: a slim track with a cream stem, as on desktop. */
function VolumeBar({ value, onChange, width }: { value: number; onChange: (v: number) => void; width: number }) {
  const [w, setW] = useState(0);
  const set = (x: number) => onChange(Math.min(1, Math.max(0, x / Math.max(1, w))));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => set(e.x))
    .onUpdate((e) => set(e.x));
  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[styles.vol, { width }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Volume"
        accessibilityValue={{ text: `${Math.round(value * 100)} percent` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === "increment" ? 0.1 : -0.1))))}
      >
        <View style={styles.volTrack}>
          <View style={{ width: `${value * 100}%`, height: "100%", backgroundColor: room.cream }} />
        </View>
        <View style={[styles.volStem, { left: value * w - 1.5 }]} />
      </View>
    </GestureDetector>
  );
}

function Ctl({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tick(); onPress(); }} hitSlop={2} style={({ pressed }) => [styles.ctl, pressed && { backgroundColor: "rgba(242,239,232,0.12)" }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: room.bg },
  header: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(11,11,10,0.55)", paddingBottom: space.xs },
  tallyRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  lamp: { width: 7, height: 7, borderRadius: 1 },
  deck: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,11,10,0.62)", paddingTop: space.xs },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  timeL: { color: room.ink, width: 52, textAlign: "right", fontSize: 12.5 },
  timeR: { color: room.ink2, width: 58, fontSize: 12.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  inline: { flexDirection: "row", alignItems: "center" },
  divider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: room.seam, marginHorizontal: space.s },
  play: { borderRadius: 8, backgroundColor: room.cream, alignItems: "center", justifyContent: "center", marginRight: space.xs },
  ctl: { width: 44, height: TOUCH, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  compactDeck: { position: "absolute", gap: space.s },
  compactRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingLeft: space.xs, minHeight: 52, borderRadius: 12, backgroundColor: "rgba(20,20,18,0.82)", borderWidth: StyleSheet.hairlineWidth, borderColor: room.seam },
  timeC: { color: room.ink2, fontSize: 12, minWidth: 36, textAlign: "center" },
  readouts: { flexDirection: "row", gap: 2 },
  readout: { minWidth: 48, minHeight: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: 6, paddingHorizontal: 4 },
  vol: { width: 84, height: TOUCH, justifyContent: "center" },
  volTrack: { height: 3, borderRadius: 1.5, backgroundColor: room.track, overflow: "hidden" },
  volStem: { position: "absolute", top: TOUCH / 2 - 8, width: 3, height: 16, borderRadius: 1, backgroundColor: room.cream },
  bubble: { position: "absolute", bottom: 150, width: 184, backgroundColor: room.ply2, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: room.seam, overflow: "hidden" },
  bubbleImg: { width: 184, height: 104, backgroundColor: "#000" },
  bubbleText: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 10, paddingVertical: 7 },
  bubbleNote: { ...textStyles.caption, color: room.ink3, paddingHorizontal: 10, paddingBottom: 7, marginTop: -3 },
  burst: { position: "absolute", top: 0, bottom: 0, width: "38%", justifyContent: "center", alignItems: "center" },
  burstWash: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(242,239,232,0.10)" },
  burstText: { fontFamily: font.bold, fontSize: 22, color: room.ink, fontVariant: ["tabular-nums"] },
  osd: { position: "absolute", alignSelf: "center", backgroundColor: room.ply2, paddingHorizontal: space.l, paddingVertical: space.s, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: room.seam },
  resume: { alignSelf: "center", flexDirection: "row", gap: space.l, alignItems: "center", backgroundColor: room.ply2, paddingHorizontal: space.l, paddingVertical: space.m, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: room.seam, marginBottom: space.s },
  hint: { alignSelf: "center", backgroundColor: room.ply, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 6, marginBottom: space.s },
  unlock: { flexDirection: "row", alignItems: "center", gap: space.s, backgroundColor: room.ply2, borderRadius: 24, paddingHorizontal: space.l, minHeight: TOUCH, borderWidth: StyleSheet.hairlineWidth, borderColor: room.seam },
  errorBox: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: space.xxl, backgroundColor: room.bg },
  errorTitle: { color: room.ink, marginTop: space.s, textAlign: "center", fontFamily: font.spine, fontSize: 24 },
  errorBtn: { backgroundColor: room.cream, paddingHorizontal: space.xl, minHeight: TOUCH, justifyContent: "center", borderRadius: 6 },
  errorBtnPlain: { backgroundColor: "transparent", borderWidth: 1, borderColor: room.seam },
});

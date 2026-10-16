import { radios, type OsdNode } from "../../components/OsdMenu";
import { SPEED_STEPS } from "../../services/playback/actions";
import { formatTime, trackLabel } from "../../services/playback/format";
import { ASPECT_RATIOS, type PlaybackCommand, type PlaybackSnapshot, type QueueSnapshot, type RepeatMode } from "../../services/playback/types";

export interface MenuContext {
  s: PlaybackSnapshot;
  q: QueueSnapshot;
  hasMedia: boolean;
  isFullscreen: boolean;
  immersive: boolean;
  compactDeck: boolean;
  panel: "queue" | "inspector" | null;
  /** Runs a registered action (same path as its keyboard shortcut). */
  act: (id: string) => void;
  exec: (c: PlaybackCommand) => void;
  setRepeat: (m: RepeatMode) => void;
  hint: (id: string) => string | undefined;
}

const NO_MEDIA = "Open a file first";
const ms = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ms`;

/**
 * The player's menus as data. One tree feeds the right-click ladder, the
 * deck's readout keys and the More button, so every route to a tool shows the
 * same words, the same keys and the same engine-confirmed values. Only tools
 * the engine supports appear; unavailable ones say why.
 */
export function buildPlayerMenus(c: MenuContext) {
  const { s, q, hasMedia } = c;
  const off = !hasMedia;
  const item = (id: string, label: string, run: () => void, extra: Partial<Extract<OsdNode, { kind: "item" }>> = {}): OsdNode => ({
    kind: "item",
    id,
    label,
    run,
    disabled: extra.disabled ?? off,
    reason: extra.reason ?? (off ? NO_MEDIA : undefined),
    ...extra,
  });
  const action = (id: string, label: string, extra: Partial<Extract<OsdNode, { kind: "item" }>> = {}) => item(id, label, () => c.act(id), { hint: c.hint(id), ...extra });
  const sep = (id: string): OsdNode => ({ kind: "sep", id });
  const label = (id: string, text: string): OsdNode => ({ kind: "label", id, text });

  const audio = s.tracks.filter((t) => t.kind === "audio");
  const subs = s.tracks.filter((t) => t.kind === "subtitle");
  const audioOn = audio.findIndex((t) => t.isSelected);
  const subOn = subs.findIndex((t) => t.isSelected);
  const trackName = (list: typeof audio, i: number) => (i < 0 ? "Off" : trackLabel(list[i]!, i + 1).primary);
  const noChapters = s.chapters.length === 0;
  const a = s.adjust;

  const speed: OsdNode[] = [
    ...radios(
      "speed",
      SPEED_STEPS.map((v) => ({ value: v, label: v === 1 ? "Normal" : `${v}×` })),
      SPEED_STEPS.find((v) => Math.abs(v - s.speed) < 1e-6) ?? -1,
      (v) => c.exec({ type: "setSpeed", multiplier: v }),
      off,
      off ? NO_MEDIA : undefined,
    ),
    sep("speed-sep"),
    action("speed.down", "Slower", { keepOpen: true }),
    action("speed.up", "Faster", { keepOpen: true }),
  ];

  const audioTracks: OsdNode[] =
    audio.length === 0
      ? [item("audio-none", "No audio in this file", () => {}, { disabled: true, reason: "The file has no audio track" })]
      : audio.map((t, i) => {
          const l = trackLabel(t, i + 1);
          return item(`audio:${t.id}`, l.primary, () => c.exec({ type: "selectAudioTrack", trackId: t.id }), { value: l.secondary, radio: true, checked: t.isSelected });
        });

  const audioMenu: OsdNode[] = [
    label("audio-l1", "Track"),
    ...audioTracks,
    sep("audio-s1"),
    action("volume.mute", "Mute", { checked: s.isMuted, disabled: false, reason: undefined }),
    action("volume.down", "Volume down", { keepOpen: true, value: `${s.volumePercent}%`, disabled: false, reason: undefined }),
    action("volume.up", "Volume up", { keepOpen: true, disabled: false, reason: undefined }),
    sep("audio-s2"),
    label("audio-l2", `Delay · ${ms(a.audioDelayMs)}`),
    action("audio.earlier", "Earlier by 50 ms", { keepOpen: true }),
    action("audio.later", "Later by 50 ms", { keepOpen: true }),
    action("audio.reset", "Reset delay to 0", { disabled: off || a.audioDelayMs === 0, reason: off ? NO_MEDIA : "Audio is not delayed" }),
  ];

  const subtitleTracks: OsdNode[] =
    subs.length === 0
      ? [item("subs-none", "No subtitles in this file", () => {}, { disabled: true, reason: "Add a subtitle file instead" })]
      : [
          item("subs:off", "Off", () => c.exec({ type: "selectSubtitleTrack", trackId: null }), { radio: true, checked: subOn < 0 }),
          ...subs.map((t, i) => {
            const l = trackLabel(t, i + 1);
            return item(`subs:${t.id}`, l.primary, () => c.exec({ type: "selectSubtitleTrack", trackId: t.id }), { value: l.secondary, radio: true, checked: t.isSelected });
          }),
        ];

  const subtitleMenu: OsdNode[] = [
    label("subs-l1", "Track"),
    ...subtitleTracks,
    action("subs.add", "Add subtitle file…"),
    sep("subs-s1"),
    label("subs-l2", `Size · ${a.subtitleScalePercent}%`),
    action("subs.smaller", "Smaller", { keepOpen: true, disabled: a.subtitleScalePercent <= 50, reason: "Smallest size", hint: c.hint("subs.smaller") ?? "Ctrl+wheel" }),
    action("subs.bigger", "Larger", { keepOpen: true, disabled: a.subtitleScalePercent >= 300, reason: "Largest size", hint: c.hint("subs.bigger") ?? "Ctrl+wheel" }),
    action("subs.sizeReset", "Authored size", { disabled: a.subtitleScalePercent === 100, reason: "Already at the authored size" }),
    sep("subs-s2"),
    label("subs-l3", `Delay · ${ms(a.subtitleDelayMs)}`),
    action("subs.earlier", "Earlier by 50 ms", { keepOpen: true }),
    action("subs.later", "Later by 50 ms", { keepOpen: true }),
    action("subs.reset", "Reset delay to 0", { disabled: off || a.subtitleDelayMs === 0, reason: off ? NO_MEDIA : "Subtitles are not delayed" }),
  ];

  const repeatMenu = radios<RepeatMode>(
    "repeat",
    [
      { value: "off", label: "Off" },
      { value: "one", label: "This title" },
      { value: "all", label: "The whole queue" },
    ],
    q.repeat,
    c.setRepeat,
  );
  const repeatValue = { off: "Off", one: "This title", all: "Queue" }[q.repeat];
  const loop = s.abLoop;

  const playback: OsdNode[] = [
    action("play.stop", "Stop"),
    sep("pb-s1"),
    action("seek.back.short", "Back 5 seconds"),
    action("seek.fwd.short", "Forward 5 seconds"),
    action("seek.goto", "Jump to time…"),
    sep("pb-s2"),
    action("chapter.prev", "Previous chapter", { disabled: off || noChapters, reason: off ? NO_MEDIA : "This file has no chapters" }),
    action("chapter.next", "Next chapter", { disabled: off || noChapters, reason: off ? NO_MEDIA : "This file has no chapters" }),
    ...(noChapters
      ? []
      : [
          {
            kind: "sub" as const,
            id: "chapters",
            label: "Chapters",
            value: String(s.chapters.length),
            children: s.chapters.map((ch, i) =>
              item(`ch:${ch.timeMs}`, ch.title ?? `Chapter ${i + 1}`, () => c.exec({ type: "seek", positionMs: ch.timeMs, exact: true }), {
                value: formatTime(ch.timeMs),
                radio: true,
                checked: ch.timeMs <= s.positionMs && (s.chapters[i + 1]?.timeMs ?? Infinity) > s.positionMs,
              }),
            ),
          },
        ]),
    sep("pb-s3"),
    action("frame.prev", "Previous frame"),
    action("frame.next", "Next frame"),
    sep("pb-s4"),
    { kind: "sub", id: "speed", label: "Speed", value: `${+s.speed.toFixed(2)}×`, disabled: off, reason: off ? NO_MEDIA : undefined, children: speed },
    action("loop.ab", loop.aMs == null ? "A–B loop: set start" : loop.bMs == null ? "A–B loop: set end" : "A–B loop: clear", {
      value: loop.aMs == null ? undefined : loop.bMs == null ? `A ${formatTime(loop.aMs)}` : `${formatTime(loop.aMs)}–${formatTime(loop.bMs)}`,
    }),
  ];

  const video: OsdNode[] = [
    {
      kind: "sub",
      id: "aspect",
      label: "Aspect ratio",
      value: a.aspectRatio ?? "As encoded",
      disabled: off,
      reason: off ? NO_MEDIA : undefined,
      children: radios<string | null>(
        "aspect",
        [{ value: null, label: "As encoded" }, ...ASPECT_RATIOS.map((r) => ({ value: r, label: r }))],
        a.aspectRatio,
        (r) => c.exec({ type: "setAspectRatio", ratio: r }),
      ),
    },
    {
      kind: "sub",
      id: "rotate",
      label: "Rotation",
      value: `${a.rotation}°`,
      disabled: off,
      reason: off ? NO_MEDIA : undefined,
      children: radios("rotate", [0, 90, 180, 270].map((d) => ({ value: d, label: d === 0 ? "None" : `${d}° clockwise` })), a.rotation, (d) => c.exec({ type: "setRotation", degrees: d })),
    },
    action("video.deinterlace", "Deinterlace", { checked: a.deinterlace }),
    sep("v-s1"),
    action("video.snapshot", "Save frame to Pictures"),
    sep("v-s2"),
    item("v-decode", "Decoding", () => c.act("view.inspector"), {
      value: s.video?.hwdec ? `Hardware · ${s.video.hwdec}` : s.video ? "Software" : "—",
      disabled: off,
    }),
  ];

  const view: OsdNode[] = [
    action("view.fullscreen", "Fullscreen", { checked: c.isFullscreen, disabled: false, reason: undefined }),
    action("view.deck", "Compact control bar", { checked: c.compactDeck, disabled: false, reason: undefined }),
    action("view.immersive", "Hide controls (immersive)", { checked: c.immersive, disabled: false, reason: undefined }),
    sep("view-s1"),
    action("view.queue", "Queue panel", { checked: c.panel === "queue", disabled: false, reason: undefined }),
    action("view.inspector", "Playback details panel", { checked: c.panel === "inspector", disabled: false, reason: undefined }),
  ];

  const playlist: OsdNode[] = [
    action("queue.prev", "Previous title", { disabled: !q.hasPrevious && off, reason: "Nothing before this title" }),
    action("queue.next", "Next title", { disabled: !q.hasNext && q.repeat !== "all", reason: "Nothing queued after this title" }),
    sep("pl-s1"),
    { kind: "sub", id: "repeat", label: "Repeat", value: repeatValue, children: repeatMenu },
    action("queue.shuffle", "Shuffle upcoming", { disabled: q.items.length < 3, reason: "Queue two or more upcoming titles first" }),
    sep("pl-s2"),
    action("view.queue", "Show queue…", { disabled: false, reason: undefined }),
  ];

  const tools: OsdNode[] = [
    action("view.inspector", "Playback details", { disabled: false, reason: undefined }),
    action("view.help", "Keyboard & mouse", { disabled: false, reason: undefined }),
    action("view.settings", "Settings…", { disabled: false, reason: undefined }),
  ];

  const playing = s.phase === "playing" || s.phase === "seeking";
  const root: OsdNode[] = [
    action("play.toggle", playing ? "Pause" : "Play"),
    sep("r-s1"),
    { kind: "sub", id: "m-playback", label: "Playback", children: playback },
    { kind: "sub", id: "m-audio", label: "Audio", value: audio.length ? trackName(audio, audioOn) : undefined, children: audioMenu },
    { kind: "sub", id: "m-subs", label: "Subtitles", value: subs.length ? trackName(subs, subOn) : undefined, children: subtitleMenu },
    { kind: "sub", id: "m-video", label: "Video", children: video },
    { kind: "sub", id: "m-view", label: "View", children: view },
    { kind: "sub", id: "m-playlist", label: "Playlist", value: q.items.length > 1 ? String(q.items.length) : undefined, children: playlist },
    { kind: "sub", id: "m-tools", label: "Tools", children: tools },
    sep("r-s2"),
    action("file.open", "Open file…", { disabled: false, reason: undefined }),
    action("view.library", "Back to library", { disabled: false, reason: undefined }),
  ];

  return { root, speed, audio: audioMenu, subtitles: subtitleMenu };
}

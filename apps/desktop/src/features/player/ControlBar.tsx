import { useState, type ReactNode } from "react";
import { Menu, type MenuItem } from "../../components/Menu";
import {
  AudioTrackIcon, ExitFullscreenIcon, FullscreenIcon, InfoIcon, LoopIcon, MuteIcon, NextIcon, PauseIcon,
  PlayIcon, PreviousIcon, QueueIcon, SpeedIcon, SubtitlesIcon, VolumeIcon,
} from "../../components/icons";
import { execute, queue, useQueue, type EngineInfo } from "../../services/playback/client";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { formatTime, trackLabel } from "../../services/playback/format";
import { MAX_VOLUME, SPEEDS, type PlaybackSnapshot, type TrackKind } from "../../services/playback/types";
import { Inspector } from "./Inspector";
import { SeekBar } from "./SeekBar";

type MenuId = "audio" | "subs" | "speed" | "info" | null;

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded}
      aria-haspopup={props.expanded === undefined ? undefined : "menu"}
      disabled={props.disabled}
      onClick={props.onClick}
      className={[
        "press flex shrink-0 items-center justify-center rounded-full disabled:opacity-35",
        props.big ? "size-11 bg-cream text-ink hover:bg-white" : "size-9 text-cream/85 hover:bg-white/10 hover:text-cream",
        props.active ? "text-ember" : "",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

export function ControlBar(props: {
  snapshot: PlaybackSnapshot;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onMenuChange: (open: boolean) => void;
  engine: EngineInfo | null;
  queueOpen: boolean;
  onToggleQueue: () => void;
  onError: (e: unknown) => void;
}) {
  const q = useQueue();
  const s = props.snapshot;
  const [menu, setMenuState] = useState<MenuId>(null);
  const setMenu = (m: MenuId) => {
    setMenuState(m);
    props.onMenuChange(m !== null);
  };
  const toggle = (m: Exclude<MenuId, null>) => setMenu(menu === m ? null : m);
  const hasMedia = !["idle", "error", "stopped"].includes(s.phase);
  const isPaused = s.phase === "paused" || s.phase === "ended";

  const trackItems = (kind: TrackKind): MenuItem[] =>
    s.tracks
      .filter((t) => t.kind === kind)
      .map((t, i) => {
        const label = trackLabel(t, i + 1);
        return {
          key: t.id,
          primary: label.primary,
          secondary: label.secondary,
          selected: t.isSelected,
          onSelect: () =>
            void execute(kind === "audio" ? { type: "selectAudioTrack", trackId: t.id } : { type: "selectSubtitleTrack", trackId: t.id }),
        };
      });
  const subItems = trackItems("subtitle");
  const subsOn = subItems.some((i) => i.selected);
  const audioItems = trackItems("audio");
  const loop = s.abLoop;
  const loopLabel =
    loop.aMs == null ? "Set loop start A (L)" : loop.bMs == null ? `Set loop end B (L) · A at ${formatTime(loop.aMs)}` : `Clear A–B loop (L) · ${formatTime(loop.aMs)}–${formatTime(loop.bMs)}`;
  const multi = q.items.length > 1;

  return (
    <div className="flex flex-col gap-2 px-5 pb-4 pt-10">
      <SeekBar positionMs={s.positionMs} durationMs={s.durationMs} disabled={!hasMedia} abLoop={s.abLoop} />
      <div className="flex items-center gap-1.5">
        <IconButton big label={isPaused ? "Play (Space)" : "Pause (Space)"} disabled={!hasMedia} onClick={() => void execute({ type: "togglePause" })}>
          {isPaused ? <PlayIcon width={22} height={22} /> : <PauseIcon width={22} height={22} />}
        </IconButton>
        {multi && (
          <>
            <IconButton label="Previous (Shift+P)" disabled={!hasMedia && !q.hasPrevious} onClick={() => void queue.previous().catch(props.onError)}>
              <PreviousIcon width={18} height={18} />
            </IconButton>
            <IconButton label="Next (Shift+N)" disabled={!q.hasNext} onClick={() => void queue.next().catch(props.onError)}>
              <NextIcon width={18} height={18} />
            </IconButton>
          </>
        )}

        <div className="group/vol ml-1 flex items-center">
          <IconButton label={s.isMuted ? "Unmute (M)" : "Mute (M)"} onClick={() => void execute({ type: "setMuted", muted: !s.isMuted })}>
            {s.isMuted || s.volumePercent === 0 ? <MuteIcon /> : <VolumeIcon />}
          </IconButton>
          <input
            type="range"
            aria-label="Volume"
            aria-valuetext={`${s.volumePercent} percent${s.isMuted ? ", muted" : ""}`}
            min={0}
            max={MAX_VOLUME}
            value={s.isMuted ? 0 : s.volumePercent}
            onChange={(e) => {
              const percent = Number(e.currentTarget.value);
              void execute({ type: "setVolume", percent });
              if (s.isMuted && percent > 0) void execute({ type: "setMuted", muted: false });
            }}
            style={{ ["--fill" as string]: `${((s.isMuted ? 0 : s.volumePercent) / MAX_VOLUME) * 100}%` }}
            className="volume-input w-24 cursor-pointer"
          />
        </div>

        <div className="ml-3 text-sm tabular-nums text-cream/80" aria-live="off">
          <span className="text-cream">{formatTime(s.positionMs)}</span>
          <span className="mx-1 text-ash">/</span>
          {formatTime(s.durationMs)}
        </div>

        <div className="ml-4 min-w-0 flex-1 truncate text-sm text-ash" title={s.path ?? undefined}>
          {s.mediaTitle}
        </div>

        <button
          type="button"
          aria-label={loopLabel}
          title={loopLabel}
          disabled={!hasMedia}
          onClick={() => void execute(nextAbLoop(s))}
          className={[
            "press flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums disabled:opacity-35",
            loop.aMs != null ? "text-ember hover:bg-white/10" : "text-cream/85 hover:bg-white/10 hover:text-cream",
          ].join(" ")}
        >
          <LoopIcon />
          <span aria-hidden>{loop.aMs == null ? "A–B" : loop.bMs == null ? "A·" : "A–B"}</span>
        </button>

        <div className="relative">
          <IconButton label="Playback speed" expanded={menu === "speed"} active={s.speed !== 1} disabled={!hasMedia} onClick={() => toggle("speed")}>
            <SpeedIcon />
          </IconButton>
          <Menu
            open={menu === "speed"}
            onClose={() => setMenu(null)}
            label="Playback speed"
            align="right"
            sections={[{
              title: "Speed",
              items: SPEEDS.map((v) => ({
                key: String(v),
                primary: v === 1 ? "Normal" : `${v}×`,
                selected: Math.abs(s.speed - v) < 1e-6,
                onSelect: () => void execute({ type: "setSpeed", multiplier: v }),
              })),
            }]}
          />
        </div>

        <div className="relative">
          <IconButton label="Audio track" expanded={menu === "audio"} disabled={!hasMedia} onClick={() => toggle("audio")}>
            <AudioTrackIcon />
          </IconButton>
          <Menu
            open={menu === "audio"}
            onClose={() => setMenu(null)}
            label="Audio track"
            align="right"
            sections={[{ title: "Audio", items: audioItems, empty: "No audio tracks" }]}
          />
        </div>

        <div className="relative">
          <IconButton label="Subtitles" expanded={menu === "subs"} active={subsOn} disabled={!hasMedia} onClick={() => toggle("subs")}>
            <SubtitlesIcon />
          </IconButton>
          <Menu
            open={menu === "subs"}
            onClose={() => setMenu(null)}
            label="Subtitles"
            align="right"
            sections={[{
              title: "Subtitles",
              empty: "This file has no subtitles",
              items: subItems.length === 0 ? [] : [
                { key: "off", primary: "Off", selected: !subsOn, onSelect: () => void execute({ type: "selectSubtitleTrack", trackId: null }) },
                ...subItems,
              ],
            }]}
          />
        </div>

        <div className="relative">
          <IconButton label="Playback info" expanded={menu === "info"} onClick={() => toggle("info")}>
            <InfoIcon />
          </IconButton>
          <Menu open={menu === "info"} onClose={() => setMenu(null)} label="Playback info" align="right" sections={[]}>
            <Inspector open={menu === "info"} sessionId={s.sessionId} engine={props.engine} />
          </Menu>
        </div>

        <IconButton label={props.queueOpen ? "Hide queue (Q)" : "Show queue (Q)"} active={props.queueOpen} onClick={props.onToggleQueue}>
          <QueueIcon />
        </IconButton>

        <IconButton label={props.isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={props.onToggleFullscreen}>
          {props.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </IconButton>
      </div>
    </div>
  );
}

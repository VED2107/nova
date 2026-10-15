import { useState } from "react";
import { Menu, type MenuItem } from "../../components/Menu";
import {
  ExitFullscreenIcon, FullscreenIcon, LoopIcon, MuteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, TracksIcon, VolumeIcon,
} from "../../components/icons";
import { IconButton } from "../../components/ui/controls";
import { execute, queue, useQueue } from "../../services/playback/client";
import { formatTime, trackLabel } from "../../services/playback/format";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { MAX_VOLUME, SPEEDS, type PlaybackSnapshot, type TrackKind } from "../../services/playback/types";
import { setPref, usePrefs } from "../../services/prefs";
import { SeekBar } from "./SeekBar";

type MenuId = "tracks" | "speed" | null;

export function ControlBar(props: {
  snapshot: PlaybackSnapshot;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onMenuChange: (open: boolean) => void;
  onError: (e: unknown) => void;
}) {
  const s = props.snapshot;
  const q = useQueue();
  const prefs = usePrefs();
  const compact = prefs.controls === "compact";
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
            void execute(kind === "audio" ? { type: "selectAudioTrack", trackId: t.id } : { type: "selectSubtitleTrack", trackId: t.id }).catch(props.onError),
        };
      });
  const subs = trackItems("subtitle");
  const subsOn = subs.some((i) => i.selected);
  const audio = trackItems("audio");
  const loop = s.abLoop;
  const loopLabel =
    loop.aMs == null
      ? "Set loop start (L)"
      : loop.bMs == null
        ? `Set loop end (L) · start ${formatTime(loop.aMs)}`
        : `Clear loop (L) · ${formatTime(loop.aMs)} – ${formatTime(loop.bMs)}`;
  const remaining = prefs.timeDisplay === "remaining" && s.durationMs != null;
  const multi = q.items.length > 1;

  return (
    <div className={`flex flex-col ${compact ? "gap-1 px-4 pb-2.5 pt-8" : "gap-2 px-6 pb-4 pt-12"}`}>
      <SeekBar positionMs={s.positionMs} durationMs={s.durationMs} disabled={!hasMedia} abLoop={s.abLoop} />
      <div className="flex items-center gap-1">
        {multi && (
          <IconButton tone="room" label="Previous (Shift+P)" disabled={!hasMedia && !q.hasPrevious} onClick={() => void queue.previous().catch(props.onError)}>
            <PreviousIcon size={18} />
          </IconButton>
        )}
        <button
          type="button"
          aria-label={isPaused ? "Play (Space)" : "Pause (Space)"}
          title={isPaused ? "Play (Space)" : "Pause (Space)"}
          disabled={!hasMedia}
          onClick={() => void execute({ type: "togglePause" }).catch(props.onError)}
          className={`press flex shrink-0 items-center justify-center rounded-full bg-cream text-ink hover:bg-white disabled:opacity-35 ${compact ? "size-9" : "size-11"}`}
        >
          {isPaused ? <PlayIcon size={compact ? 18 : 20} /> : <PauseIcon size={compact ? 18 : 20} />}
        </button>
        {multi && (
          <IconButton tone="room" label="Next (Shift+N)" disabled={!q.hasNext} onClick={() => void queue.next().catch(props.onError)}>
            <NextIcon size={18} />
          </IconButton>
        )}

        <div className="ml-2 flex items-center gap-1">
          <IconButton tone="room" label={s.isMuted ? "Unmute (M)" : "Mute (M)"} onClick={() => void execute({ type: "setMuted", muted: !s.isMuted })}>
            {s.isMuted || s.volumePercent === 0 ? <MuteIcon /> : <VolumeIcon />}
          </IconButton>
          {!compact && (
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
              className="level-input w-[84px] cursor-pointer"
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => void setPref("timeDisplay", remaining ? "elapsed" : "remaining").catch(() => {})}
          title={remaining ? "Show elapsed time" : "Show remaining time"}
          aria-label={`${formatTime(s.positionMs)} of ${formatTime(s.durationMs)}. ${remaining ? "Show elapsed time" : "Show remaining time"}`}
          className="ml-3 rounded-[5px] px-1.5 py-1 text-[13px] font-[560] tabular-nums text-room-ink-2 hover:bg-white/8 hover:text-room-ink"
        >
          <span className="text-room-ink">{remaining ? `−${formatTime(Math.max(0, (s.durationMs ?? 0) - s.positionMs))}` : formatTime(s.positionMs)}</span>
          <span className="mx-1.5 text-room-ink-3">/</span>
          {formatTime(s.durationMs)}
        </button>

        <span className="flex-1" />

        <button
          type="button"
          aria-label={loopLabel}
          title={loopLabel}
          aria-pressed={loop.aMs != null}
          disabled={!hasMedia}
          onClick={() => void execute(nextAbLoop(s)).catch(props.onError)}
          className={`press flex h-9 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-[650] tracking-[0.04em] disabled:opacity-35 ${
            loop.aMs != null ? "text-ember hover:bg-white/10" : "text-room-ink-2 hover:bg-white/10 hover:text-room-ink"
          }`}
        >
          <LoopIcon size={18} />
          <span aria-hidden>{loop.aMs == null ? "A–B" : loop.bMs == null ? "A → ?" : "A–B on"}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "speed"}
            aria-label={`Playback speed ${s.speed}×`}
            title="Playback speed"
            disabled={!hasMedia}
            onClick={() => toggle("speed")}
            className={`press h-9 min-w-[48px] rounded-[7px] px-2 text-[13px] font-[650] tabular-nums hover:bg-white/10 disabled:opacity-35 ${
              s.speed !== 1 ? "text-ember" : "text-room-ink-2 hover:text-room-ink"
            }`}
          >
            {+s.speed.toFixed(2)}×
          </button>
          <Menu
            open={menu === "speed"}
            onClose={() => setMenu(null)}
            label="Playback speed"
            width="11rem"
            sections={[
              {
                title: "Speed",
                items: SPEEDS.map((v) => ({
                  key: String(v),
                  primary: v === 1 ? "Normal" : `${v}×`,
                  selected: Math.abs(s.speed - v) < 1e-6,
                  onSelect: () => void execute({ type: "setSpeed", multiplier: v }),
                })),
              },
            ]}
          />
        </div>

        <div className="relative">
          <IconButton
            tone="room"
            label="Audio and subtitles"
            aria-haspopup="menu"
            aria-expanded={menu === "tracks"}
            active={subsOn}
            disabled={!hasMedia}
            onClick={() => toggle("tracks")}
          >
            <TracksIcon />
          </IconButton>
          <Menu
            open={menu === "tracks"}
            onClose={() => setMenu(null)}
            label="Audio and subtitles"
            sections={[
              { title: "Audio", items: audio, empty: "No audio tracks" },
              {
                title: "Subtitles",
                empty: "This file has no subtitles",
                items:
                  subs.length === 0
                    ? []
                    : [{ key: "off", primary: "Off", selected: !subsOn, onSelect: () => void execute({ type: "selectSubtitleTrack", trackId: null }) }, ...subs],
              },
            ]}
          />
        </div>

        <IconButton tone="room" label={props.isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={props.onToggleFullscreen}>
          {props.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </IconButton>
      </div>
    </div>
  );
}

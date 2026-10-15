import { useState } from "react";
import { Menu, type MenuItem } from "../../components/Menu";
import {
  ExitFullscreenIcon, FullscreenIcon, InfoIcon, LoopIcon, MoreIcon, MuteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, QueueIcon, TracksIcon, VolumeIcon,
} from "../../components/icons";
import { IconButton } from "../../components/ui/controls";
import { execute, queue, useQueue } from "../../services/playback/client";
import { formatTime, trackLabel } from "../../services/playback/format";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { MAX_VOLUME, SPEEDS, type PlaybackSnapshot, type TrackKind } from "../../services/playback/types";
import { setPref, usePrefs } from "../../services/prefs";
import { SeekBar } from "./SeekBar";

type MenuId = "tracks" | "speed" | null;
export type DeckPanel = "queue" | "inspector" | null;

/**
 * The deck: one integrated transport. Timeline on top; transport and time on
 * the left; a quiet group (loop, speed, tracks), the panels, every other tool
 * ("More") and fullscreen on the right, in falling order of how often they
 * are reached for.
 */
export function ControlBar(props: {
  snapshot: PlaybackSnapshot;
  isFullscreen: boolean;
  panel: DeckPanel;
  hint: (actionId: string) => string | undefined;
  onToggleFullscreen: () => void;
  onTogglePanel: (p: Exclude<DeckPanel, null>) => void;
  onOpenTools: (anchor: DOMRect) => void;
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
  // Show "Play" unless the engine is running or about to (paused, ended, stopped, idle, error).
  const isPaused = !["playing", "seeking", "loading"].includes(s.phase);
  const k = (id: string, fallback: string) => props.hint(id) ?? fallback;
  const label = (text: string, id: string, fallback: string) => `${text} (${k(id, fallback)})`;

  const trackItems = (kind: TrackKind): MenuItem[] =>
    s.tracks
      .filter((t) => t.kind === kind)
      .map((t, i) => {
        const l = trackLabel(t, i + 1);
        return {
          key: t.id,
          primary: l.primary,
          secondary: l.secondary,
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
      ? `Set loop start (${k("loop.ab", "L")})`
      : loop.bMs == null
        ? `Set loop end (${k("loop.ab", "L")}) · start ${formatTime(loop.aMs)}`
        : `Clear loop (${k("loop.ab", "L")}) · ${formatTime(loop.aMs)} – ${formatTime(loop.bMs)}`;
  const remaining = prefs.timeDisplay === "remaining" && s.durationMs != null;
  const multi = q.items.length > 1;
  const quiet = "press h-9 rounded-[7px] px-2 text-[12.5px] font-[650] tabular-nums hover:bg-white/10 disabled:opacity-35";

  return (
    <div className={`flex flex-col ${compact ? "gap-0.5 px-4 pb-2.5 pt-10" : "gap-1.5 px-6 pb-4 pt-16"}`}>
      <SeekBar positionMs={s.positionMs} durationMs={s.durationMs} disabled={!hasMedia} abLoop={s.abLoop} />
      <div className="flex min-w-0 items-center gap-1">
        {multi && (
          <IconButton tone="room" label={label("Previous", "queue.prev", "P")} disabled={!hasMedia && !q.hasPrevious} onClick={() => void queue.previous().catch(props.onError)}>
            <PreviousIcon size={18} />
          </IconButton>
        )}
        <button
          type="button"
          aria-label={isPaused ? label("Play", "play.toggle", "Space") : label("Pause", "play.toggle", "Space")}
          title={isPaused ? label("Play", "play.toggle", "Space") : label("Pause", "play.toggle", "Space")}
          disabled={!hasMedia}
          onClick={() => void execute({ type: "togglePause" }).catch(props.onError)}
          className={`press flex shrink-0 items-center justify-center rounded-full bg-cream text-[#171715] hover:bg-white disabled:opacity-35 ${compact ? "size-9" : "size-11"}`}
        >
          {isPaused ? <PlayIcon size={compact ? 18 : 20} /> : <PauseIcon size={compact ? 18 : 20} />}
        </button>
        {multi && (
          <IconButton tone="room" label={label("Next", "queue.next", "N")} disabled={!q.hasNext} onClick={() => void queue.next().catch(props.onError)}>
            <NextIcon size={18} />
          </IconButton>
        )}

        <button
          type="button"
          onClick={() => void setPref("timeDisplay", remaining ? "elapsed" : "remaining").catch(props.onError)}
          title={remaining ? "Show elapsed time" : "Show remaining time"}
          aria-label={`${formatTime(s.positionMs)} of ${formatTime(s.durationMs)}. ${remaining ? "Show elapsed time" : "Show remaining time"}`}
          className="ml-2 shrink-0 rounded-[5px] px-1.5 py-1 text-[13.5px] font-[600] tabular-nums text-room-ink-2 hover:bg-white/8 hover:text-room-ink"
        >
          <span className="text-room-ink">{remaining ? `−${formatTime(Math.max(0, (s.durationMs ?? 0) - s.positionMs))}` : formatTime(s.positionMs)}</span>
          <span className="mx-1.5 text-room-ink-3">/</span>
          {formatTime(s.durationMs)}
        </button>

        <div className="group/vol ml-1 flex shrink-0 items-center">
          <IconButton tone="room" label={s.isMuted ? label("Unmute", "volume.mute", "M") : label("Mute", "volume.mute", "M")} onClick={() => void execute({ type: "setMuted", muted: !s.isMuted })}>
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

        <span className="min-w-2 flex-1" />

        {/* Quiet group: state is shown as text, ember only when not at default. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={loopLabel}
            title={loopLabel}
            aria-pressed={loop.aMs != null}
            disabled={!hasMedia}
            onClick={() => void execute(nextAbLoop(s)).catch(props.onError)}
            className={`${quiet} flex items-center gap-1.5 ${loop.aMs != null ? "text-ember" : "text-room-ink-2 hover:text-room-ink"}`}
          >
            <LoopIcon size={18} />
            <span aria-hidden className="max-[720px]:hidden">{loop.aMs == null ? "A–B" : loop.bMs == null ? "A → ?" : "A–B on"}</span>
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
              className={`${quiet} min-w-[46px] ${s.speed !== 1 ? "text-ember" : "text-room-ink-2 hover:text-room-ink"}`}
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
        </div>

        <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-room-seam" />

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            tone="room"
            label={label("Queue", "view.queue", "Q")}
            active={props.panel === "queue"}
            aria-pressed={props.panel === "queue"}
            onClick={() => props.onTogglePanel("queue")}
          >
            <QueueIcon />
          </IconButton>
          <IconButton
            tone="room"
            label={label("Playback details", "view.inspector", "I")}
            active={props.panel === "inspector"}
            aria-pressed={props.panel === "inspector"}
            onClick={() => props.onTogglePanel("inspector")}
          >
            <InfoIcon />
          </IconButton>
          <IconButton tone="room" label="More: picture, sound, subtitle timing, frames, save frame" aria-haspopup="menu" onClick={(e) => props.onOpenTools(e.currentTarget.getBoundingClientRect())}>
            <MoreIcon />
          </IconButton>
          <IconButton tone="room" label={props.isFullscreen ? label("Exit fullscreen", "view.fullscreen", "F") : label("Fullscreen", "view.fullscreen", "F")} onClick={props.onToggleFullscreen}>
            {props.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

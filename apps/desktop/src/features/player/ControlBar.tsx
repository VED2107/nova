import type { ReactNode } from "react";
import { SubtitlesIcon, DeckCompactIcon, DeckFullIcon, ExitFullscreenIcon, FullscreenIcon, InfoIcon, MoreIcon, MuteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, QueueIcon, StopIcon, VolumeIcon } from "../../components/icons";
import { IconButton } from "../../components/ui/controls";
import { execute, queue, useQueue } from "../../services/playback/client";
import { formatTime, languageName } from "../../services/playback/format";
import { nextAbLoop } from "../../services/playback/shortcuts";
import { MAX_VOLUME, type PlaybackSnapshot } from "../../services/playback/types";
import { setPref, usePrefs } from "../../services/prefs";
import { Timeline } from "./Timeline";

export type DeckPanel = "queue" | "inspector" | null;
export type DeckMenu = "speed" | "audio" | "subtitles" | "root";

/**
 * The deck: the monitor's control strip. Row one is the timeline (elapsed ·
 * bar · length). Row two: transport and level on the left; readout keys —
 * an engraved name over the engine's current value — in the middle; panels,
 * the full menu and fullscreen on the right.
 */
export function ControlBar(props: {
  snapshot: PlaybackSnapshot;
  isFullscreen: boolean;
  panel: DeckPanel;
  hint: (actionId: string) => string | undefined;
  onToggleFullscreen: () => void;
  onTogglePanel: (p: Exclude<DeckPanel, null>) => void;
  onOpenMenu: (menu: DeckMenu, anchor: DOMRect) => void;
  onError: (e: unknown) => void;
}) {
  const s = props.snapshot;
  const q = useQueue();
  const prefs = usePrefs();
  // Compact control bar: one slim row with a short timeline between the
  // transport and the tools, as in VLC. Full: the timeline across the deck.
  const inline = prefs.timelineLayout === "compact";
  const compact = inline;
  const hasMedia = !["idle", "error", "stopped"].includes(s.phase);
  const isPaused = !["playing", "seeking", "loading"].includes(s.phase);
  const k = (id: string, fallback: string) => props.hint(id) ?? fallback;
  const label = (text: string, id: string, fallback: string) => `${text} (${k(id, fallback)})`;
  const run = (p: Promise<unknown>) => void p.catch(props.onError);

  const audio = s.tracks.filter((t) => t.kind === "audio");
  const subs = s.tracks.filter((t) => t.kind === "subtitle");
  const audioOn = audio.find((t) => t.isSelected);
  const subOn = subs.find((t) => t.isSelected);
  const short = (t: (typeof s.tracks)[number] | undefined, i: number) =>
    t ? (t.language ? t.language.slice(0, 3).toUpperCase() : t.title ? t.title.slice(0, 8) : `#${i + 1}`) : "Off";
  const loop = s.abLoop;
  const loopValue = loop.aMs == null ? "Off" : loop.bMs == null ? `A ${formatTime(loop.aMs)}` : `${formatTime(loop.aMs)}–${formatTime(loop.bMs)}`;
  const loopLabel =
    loop.aMs == null
      ? `A–B loop: set start (${k("loop.ab", "L")})`
      : loop.bMs == null
        ? `A–B loop: set end (${k("loop.ab", "L")}); starts at ${formatTime(loop.aMs)}`
        : `A–B loop on, ${formatTime(loop.aMs)} to ${formatTime(loop.bMs)}. Clear (${k("loop.ab", "L")})`;
  const multi = q.items.length > 1;
  const volume = s.isMuted ? 0 : s.volumePercent;
  const timeline = (
    <Timeline
      sessionId={s.sessionId}
      positionMs={s.positionMs}
      durationMs={s.durationMs}
      disabled={!hasMedia}
      hasVideo={s.video != null && (s.video.width ?? 0) > 0}
      abLoop={s.abLoop}
      chapters={s.chapters}
      remaining={prefs.timeDisplay === "remaining"}
      onToggleTime={() => run(setPref("timeDisplay", prefs.timeDisplay === "remaining" ? "elapsed" : "remaining"))}
    />
  );
  const level = (
    <div className="flex shrink-0 items-center">
      <IconButton tone="room" label={s.isMuted ? label("Unmute", "volume.mute", "M") : label("Mute", "volume.mute", "M")} onClick={() => run(execute({ type: "setMuted", muted: !s.isMuted }))}>
        {s.isMuted || s.volumePercent === 0 ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
      </IconButton>
      <input
        type="range"
        aria-label="Volume"
        aria-valuetext={`${s.volumePercent} percent${s.isMuted ? ", muted" : ""}`}
        min={0}
        max={MAX_VOLUME}
        value={volume}
        onChange={(e) => {
          const percent = Number(e.currentTarget.value);
          run(execute({ type: "setVolume", percent }));
          if (s.isMuted && percent > 0) run(execute({ type: "setMuted", muted: false }));
        }}
        style={{ ["--fill" as string]: `${(volume / MAX_VOLUME) * 100}%` }}
        className={`level-input cursor-pointer ${compact ? "w-[56px]" : "w-[76px]"} max-[760px]:w-[44px]`}
      />
      {!compact && (
        <span aria-hidden className={`readout ml-2 w-[30px] text-[11.5px] ${s.volumePercent > 100 && !s.isMuted ? "text-ember" : "text-room-ink-3"}`}>
          {s.isMuted ? "MUTE" : s.volumePercent}
        </span>
      )}
    </div>
  );
  const menuKey = (menu: DeckMenu) => (e: React.MouseEvent<HTMLButtonElement>) => props.onOpenMenu(menu, e.currentTarget.getBoundingClientRect());

  return (
    <div
      className={
        inline
          ? "glass-float rounded-[12px] px-2 py-1"
          : "glass-bottom px-5 pb-3 pt-6"
      }
    >
      {!inline && timeline}

      <div className={`flex min-w-0 items-center gap-1 ${inline ? "" : "mt-1.5"}`}>
        {/* Transport */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={isPaused ? label("Play", "play.toggle", "Space") : label("Pause", "play.toggle", "Space")}
            title={isPaused ? label("Play", "play.toggle", "Space") : label("Pause", "play.toggle", "Space")}
            disabled={!hasMedia}
            onClick={() => run(execute({ type: "togglePause" }))}
            className={`press mr-1 flex shrink-0 items-center justify-center rounded-[7px] bg-cream text-[#171715] hover:bg-white disabled:opacity-35 ${compact ? "h-8 w-10" : "h-9 w-12"}`}
          >
            {isPaused ? <PlayIcon size={compact ? 17 : 19} /> : <PauseIcon size={compact ? 17 : 19} />}
          </button>
          <IconButton tone="room" label={label("Stop", "play.stop", "S")} disabled={!hasMedia} onClick={() => run(execute({ type: "stop" }))}>
            <StopIcon size={17} />
          </IconButton>
          {multi && (
            <>
              <IconButton tone="room" label={label("Previous", "queue.prev", "P")} disabled={!hasMedia && !q.hasPrevious} onClick={() => run(queue.previous())}>
                <PreviousIcon size={17} />
              </IconButton>
              <IconButton tone="room" label={label("Next", "queue.next", "N")} disabled={!q.hasNext && q.repeat !== "all"} onClick={() => run(queue.next())}>
                <NextIcon size={17} />
              </IconButton>
            </>
          )}
        </div>

        <Rule />

        {inline ? (
          <>
            <div className="mx-2 min-w-[140px] flex-1">{timeline}</div>
            <Rule />
            {level}
          </>
        ) : (
          <>
            {level}
            <span className="min-w-1 flex-1" />
          </>
        )}

        {/* Readout keys: name engraved, value reported by the engine; ember only when not at default. */}
        <div className="flex shrink-0 items-center gap-0.5">
          {!inline && (
            <ReadoutKey
              name="Speed"
              value={`${+s.speed.toFixed(2)}×`}
              changed={Math.abs(s.speed - 1) > 1e-6}
              label={`Playback speed, ${+s.speed.toFixed(2)} times`}
              disabled={!hasMedia}
              compact={compact}
              onClick={menuKey("speed")}
            />
          )}
          {!inline && (
            <ReadoutKey
              name="Audio"
              value={audio.length ? short(audioOn, audio.indexOf(audioOn!)) : "None"}
              changed={false}
              label={`Audio track: ${audioOn ? (languageName(audioOn.language) ?? audioOn.title ?? "track") : audio.length ? "off" : "none in this file"}`}
              disabled={!hasMedia}
              compact={compact}
              onClick={menuKey("audio")}
              hideBelow={880}
            />
          )}
          {inline ? (
            <IconButton
              tone="room"
              label={`Subtitles: ${subOn ? (languageName(subOn.language) ?? subOn.title ?? "on") : subs.length ? "off" : "none in this file"}`}
              aria-haspopup="menu"
              active={subOn != null}
              disabled={!hasMedia}
              onClick={menuKey("subtitles")}
            >
              <SubtitlesIcon size={18} />
            </IconButton>
          ) : (
          <ReadoutKey
            name="Subtitles"
            value={subs.length ? short(subOn, subs.indexOf(subOn!)) : "None"}
            changed={subOn != null}
            label={`Subtitles: ${subOn ? (languageName(subOn.language) ?? subOn.title ?? "on") : subs.length ? "off" : "none in this file"}`}
            disabled={!hasMedia}
            compact={compact}
            onClick={menuKey("subtitles")}
          />
          )}
          {!inline && (
            <ReadoutKey
              name="A–B"
              value={loopValue}
              changed={loop.aMs != null}
              pressed={loop.aMs != null}
              label={loopLabel}
              disabled={!hasMedia}
              compact={compact}
              onClick={() => run(execute(nextAbLoop(s)))}
              hideBelow={760}
            />
          )}
        </div>

        <Rule />

        <div className="flex shrink-0 items-center gap-0.5">
          {!inline && (
            <>
              <IconButton tone="room" label={label("Queue", "view.queue", "Q")} active={props.panel === "queue"} aria-pressed={props.panel === "queue"} onClick={() => props.onTogglePanel("queue")}>
                <QueueIcon size={18} />
              </IconButton>
              <IconButton
                tone="room"
                label={label("Playback details", "view.inspector", "I")}
                active={props.panel === "inspector"}
                aria-pressed={props.panel === "inspector"}
                onClick={() => props.onTogglePanel("inspector")}
              >
                <InfoIcon size={18} />
              </IconButton>
            </>
          )}
          <IconButton
            tone="room"
            label={inline ? label("Full control bar", "view.deck", "C") : label("Compact control bar", "view.deck", "C")}
            aria-pressed={inline}
            onClick={() => run(setPref("timelineLayout", inline ? "wide" : "compact"))}
          >
            {inline ? <DeckFullIcon size={18} /> : <DeckCompactIcon size={18} />}
          </IconButton>
          <IconButton tone="room" label="All controls (also right-click the picture)" aria-haspopup="menu" onClick={menuKey("root")}>
            <MoreIcon size={18} />
          </IconButton>
          <IconButton tone="room" label={props.isFullscreen ? label("Exit fullscreen", "view.fullscreen", "F") : label("Fullscreen", "view.fullscreen", "F")} onClick={props.onToggleFullscreen}>
            {props.isFullscreen ? <ExitFullscreenIcon size={18} /> : <FullscreenIcon size={18} />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function Rule() {
  return <span aria-hidden className="mx-2 h-6 w-px shrink-0 bg-room-seam" />;
}

/** A monitor function key: engraved name over a live readout. */
function ReadoutKey(props: {
  name: string;
  value: ReactNode;
  changed: boolean;
  label: string;
  disabled: boolean;
  compact: boolean;
  pressed?: boolean;
  hideBelow?: 760 | 880;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const hide = props.hideBelow === 880 ? "max-[880px]:hidden" : props.hideBelow === 760 ? "max-[760px]:hidden" : "";
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-haspopup={props.pressed === undefined ? "menu" : undefined}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`press flex shrink-0 flex-col items-start justify-center rounded-[6px] px-2 text-left hover:bg-white/[0.08] disabled:opacity-35 ${props.compact ? "h-8" : "h-10 min-w-[58px]"} ${hide}`}
    >
      {!props.compact && <span className="engrave text-room-ink-2">{props.name}</span>}
      <span className={`readout max-w-[96px] truncate text-[12.5px] ${props.compact ? "" : "mt-[3px]"} ${props.changed ? "text-ember" : "text-room-ink"}`}>{props.value}</span>
    </button>
  );
}

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronDownIcon, CloseIcon } from "@/components/icons";
import { Action, Choice, Fact, Sheet, SheetLabel, SheetNote } from "@/components/Sheet";
import { textStyles, tick } from "@/components/ui";
import { findItem, getLibrary, savePlaylist, setQueue, useLibrary, type MediaItem } from "@/core/library";
import { setPref, usePrefs } from "@/core/prefs";
import * as Q from "@/core/queue";
import { formatBytes, formatTime } from "@/core/time";
import { font, radius, room, space, TOUCH } from "@/design/tokens";
import { FIT_LABEL, SPEEDS, type Capabilities, type Fit, type Snapshot } from "@/playback/types";

export type Page = "menu" | "speed" | "tracks" | "info" | "queue" | "goto" | null;

/** What the player hands the menu: state plus the actions only the player can do. */
export interface MenuContext {
  item: MediaItem;
  s: Snapshot;
  caps: Capabilities;
  playing: boolean;
  ab: Q.AbLoop;
  fit: Fit;
  rotation: number;
  remaining: boolean;
  act: {
    toggle(): void;
    stop(): void;
    seek(ms: number): void;
    speed(v: number): void;
    abCycle(): void;
    frame(forward: boolean): void;
    track(kind: "audio" | "subtitle", id: string | null): void;
    mute(): void;
    fit(f: Fit): void;
    rotate(): void;
    pip(): void;
    lock(): void;
    rotateScreen(): void;
    next(): void;
    previous(): void;
    jump(id: string): void;
  };
}

const ENGINE_REASON = "Needs the NOVA engine (development build)";

/**
 * The player menu: desktop's right-click menu, grouped the same way
 * (Playback, Audio, Subtitles, Video, View, Playlist, Tools), each item with
 * its current value. Items the system engine cannot do say why instead of
 * disappearing.
 */
export function PlayerMenu({ page, setPage, ctx }: { page: Page; setPage: (p: Page) => void; ctx: MenuContext }) {
  const close = () => setPage(null);
  const titles: Record<Exclude<Page, null>, string> = { menu: "Player", speed: "Playback speed", tracks: "Audio & subtitles", info: "Playback information", queue: "Queue", goto: "Go to time" };
  return (
    <Sheet visible={page != null} title={page ? titles[page] : ""} onClose={close}>
      {page === "menu" && <Menu ctx={ctx} setPage={setPage} close={close} />}
      {page === "speed" && <Speed ctx={ctx} />}
      {page === "tracks" && <Tracks ctx={ctx} />}
      {page === "info" && <Info ctx={ctx} />}
      {page === "queue" && <QueuePage ctx={ctx} close={close} />}
      {page === "goto" && <GoTo ctx={ctx} close={close} />}
    </Sheet>
  );
}

function Menu({ ctx, setPage, close }: { ctx: MenuContext; setPage: (p: Page) => void; close: () => void }) {
  const { s, act, ab } = ctx;
  const lib = useLibrary();
  const audio = s.tracks.filter((t) => t.kind === "audio");
  const subs = s.tracks.filter((t) => t.kind === "subtitle");
  const sub = subs.find((t) => t.isSelected);
  const repeat = lib.queue.repeat;
  const abValue = ab.aMs == null ? "Off" : ab.bMs == null ? `A ${formatTime(ab.aMs)}` : `${formatTime(ab.aMs)}–${formatTime(ab.bMs)}`;
  const run = (f: () => void, keep = false) => () => {
    f();
    if (!keep) close();
  };
  return (
    <>
      <SheetLabel>Playback</SheetLabel>
      <Action label={ctx.playing ? "Pause" : "Play"} onPress={run(act.toggle)} />
      <Action label="Stop" onPress={run(act.stop)} />
      <Action label="Speed" value={`${s.speed}×`} chevron onPress={() => setPage("speed")} />
      <Action label="A–B loop" value={abValue} onPress={run(act.abCycle, true)} />
      <Action label="Repeat" value={{ off: "Off", all: "All", one: "One" }[repeat]} onPress={run(() => setQueue({ ...getLibrary().queue, repeat: Q.cycleRepeat(repeat) }), true)} />
      <Action label="Go to time…" chevron onPress={() => setPage("goto")} />
      <Action label="Next frame" disabled={!s.video?.frameRate} reason="Frame rate not reported for this file" onPress={run(() => act.frame(true), true)} />
      <Action label="Previous frame" disabled={!s.video?.frameRate} reason="Frame rate not reported for this file" onPress={run(() => act.frame(false), true)} />

      <SheetLabel>Audio</SheetLabel>
      <Action label="Audio track" value={audio.find((t) => t.isSelected)?.label ?? (audio.length ? "—" : "None")} chevron onPress={() => setPage("tracks")} />
      <Action label={s.muted ? "Unmute" : "Mute"} value={`${Math.round(s.volume * 100)} %`} onPress={run(act.mute, true)} />
      <Action label="Audio delay" disabled reason={ENGINE_REASON} onPress={() => {}} />

      <SheetLabel>Subtitles</SheetLabel>
      <Action label="Subtitles" value={sub?.label ?? "Off"} chevron onPress={() => setPage("tracks")} />
      <Action label="Subtitle delay" disabled reason={ENGINE_REASON} onPress={() => {}} />
      <Action label="Subtitle size" disabled reason="Follows the system caption style (Settings › Accessibility)" onPress={() => {}} />
      <Action label="Add subtitle file…" disabled reason={ENGINE_REASON} onPress={() => {}} />

      <SheetLabel>Video</SheetLabel>
      <Action label="Aspect" value={FIT_LABEL[ctx.fit]} onPress={run(() => act.fit(ctx.fit === "contain" ? "cover" : ctx.fit === "cover" ? "fill" : "contain"), true)} />
      <Action label="Rotate 90°" value={`${ctx.rotation}°`} onPress={run(act.rotate, true)} />
      <Action label="Picture in picture" disabled={!ctx.caps.canPictureInPicture} reason="Not available here" onPress={run(act.pip)} />
      <Action label="Deinterlace" disabled reason={ENGINE_REASON} onPress={() => {}} />
      <Action label="Save frame" disabled reason={ENGINE_REASON} onPress={() => {}} />

      <SheetLabel>View</SheetLabel>
      <Action label="Lock controls" onPress={run(act.lock)} />
      <Action label="Time display" value={ctx.remaining ? "Remaining" : "Total length"} onPress={run(() => setPref("timeDisplay", ctx.remaining ? "elapsed" : "remaining"), true)} />
      <Action label="Rotate screen" onPress={run(act.rotateScreen)} />

      <SheetLabel>Playlist</SheetLabel>
      <Action label="Queue" value={`${lib.queue.ids.length}`} chevron onPress={() => setPage("queue")} />
      <Action label="Next in queue" disabled={Q.nextIndex(lib.queue, false) == null} reason="End of the queue" onPress={run(act.next)} />
      <Action label="Previous" onPress={run(act.previous)} />
      <Action label="Shuffle upcoming" disabled={lib.queue.ids.length - lib.queue.index <= 2} reason="Nothing to shuffle" onPress={run(() => setQueue(Q.shuffleUpcoming(getLibrary().queue)), true)} />

      <SheetLabel>Tools</SheetLabel>
      <Action label="Playback information" chevron onPress={() => setPage("info")} />
    </>
  );
}

function Speed({ ctx }: { ctx: MenuContext }) {
  return (
    <>
      {SPEEDS.map((v) => (
        <Choice key={v} label={v === 1 ? "Normal" : `${v}×`} selected={Math.abs(ctx.s.speed - v) < 0.01} onPress={() => ctx.act.speed(v)} />
      ))}
      <SheetNote>Pitch is preserved.</SheetNote>
    </>
  );
}

function Tracks({ ctx }: { ctx: MenuContext }) {
  const audio = ctx.s.tracks.filter((t) => t.kind === "audio");
  const subs = ctx.s.tracks.filter((t) => t.kind === "subtitle");
  return (
    <>
      <SheetLabel>Audio</SheetLabel>
      {audio.length === 0 && <SheetNote>No selectable audio tracks reported.</SheetNote>}
      {audio.map((t) => (
        <Choice key={t.id} label={t.label} detail={t.language ?? undefined} selected={t.isSelected} onPress={() => ctx.act.track("audio", t.id)} />
      ))}
      <SheetLabel>Subtitles</SheetLabel>
      <Choice label="Off" selected={!subs.some((t) => t.isSelected)} onPress={() => ctx.act.track("subtitle", null)} />
      {subs.map((t) => (
        <Choice key={t.id} label={t.label} detail={t.language ?? undefined} selected={t.isSelected} onPress={() => ctx.act.track("subtitle", t.id)} />
      ))}
      <SheetNote>{`${ctx.caps.engine} draws subtitles in the system caption style (Settings › Accessibility › Subtitles & Captioning). Delay, size and external subtitle files need the NOVA engine.`}</SheetNote>
    </>
  );
}

function Info({ ctx }: { ctx: MenuContext }) {
  const { s, caps, item } = ctx;
  const lib = useLibrary();
  const audio = s.tracks.filter((t) => t.kind === "audio");
  const subs = s.tracks.filter((t) => t.kind === "subtitle");
  const fps = s.video?.frameRate;
  return (
    <>
      <SheetLabel>Engine</SheetLabel>
      <Fact k="Decoder" v={caps.engine} />
      <Fact k="Running as" v={caps.engineDetail} />
      <Fact k="Seeking" v="Exact (tolerance 0); keyframes optional while dragging" />
      <Fact k="Seek landing" v={caps.reportsSeekCompletion ? "Reported by engine" : "Inferred from the next time update"} muted />
      <SheetLabel>Media</SheetLabel>
      <Fact k="Title" v={item.title} />
      <Fact k="Folder" v={lib.folders.find((f) => f.id === item.folderId)?.name ?? (item.kind === "bundled" ? "Built in" : "Opened file")} />
      <Fact k="Format" v={item.format ?? "Not reported"} />
      <Fact k="Size" v={formatBytes(item.sizeBytes)} />
      <Fact k="Duration" v={formatTime(s.durationMs)} />
      <Fact k="Resolution" v={s.video?.width ? `${s.video.width} × ${s.video.height}` : "Not reported"} muted={!s.video?.width} />
      <Fact k="Frame rate" v={fps ? `${fps.toFixed(3).replace(/\.?0+$/, "")} fps` : "Not reported"} muted={!fps} />
      <Fact k="Dynamic range" v={s.video?.range ?? "Not reported"} muted={!s.video?.range} />
      <Fact k="Bitrate" v={s.video?.bitrate ? `${(s.video.bitrate / 1e6).toFixed(1)} Mb/s` : "Not reported"} muted={!s.video?.bitrate} />
      <Fact k="Video MIME" v={s.video?.mimeType ?? "Not reported"} muted={!s.video?.mimeType} />
      <Fact k="Tracks" v={`${audio.length} audio · ${subs.length} subtitle`} />
      <SheetNote>Hardware or software decoder, dropped frames, A/V sync and codec names are not exposed by the system player. The NOVA engine reports them.</SheetNote>
    </>
  );
}

function GoTo({ ctx, close }: { ctx: MenuContext; close: () => void }) {
  const [text, setText] = useState("");
  const ms = Q.parseTimeInput(text);
  const valid = ms != null && (ctx.s.durationMs == null || ms <= ctx.s.durationMs);
  const go = () => {
    if (!valid) return;
    ctx.act.seek(ms!);
    close();
  };
  return (
    <View style={{ paddingHorizontal: space.xl, gap: space.m }}>
      <Text style={[textStyles.label, { color: room.ink3 }]}>Formats: 1:02:03 · 62:03 · 90.5 · 1h2m3s. Length {formatTime(ctx.s.durationMs)}.</Text>
      <View style={{ flexDirection: "row", gap: space.m }}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          onSubmitEditing={go}
          keyboardType="numbers-and-punctuation"
          returnKeyType="go"
          placeholder={formatTime(ctx.s.positionMs)}
          placeholderTextColor={room.ink3}
          accessibilityLabel="Time to go to"
          style={[textStyles.readout, styles.input, { borderColor: text && !valid ? room.danger : room.seam }]}
        />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} onPress={go} style={[styles.go, { opacity: valid ? 1 : 0.4 }]}>
          <Text style={[textStyles.label, { color: room.bg, fontFamily: font.semibold }]}>Go</Text>
        </Pressable>
      </View>
      {text.length > 0 && !valid && <Text style={[textStyles.caption, { color: room.danger }]}>{ms == null ? "Not a time NOVA understands." : "Past the end of this title."}</Text>}
    </View>
  );
}

function QueuePage({ ctx, close }: { ctx: MenuContext; close: () => void }) {
  const lib = useLibrary();
  const prefs = usePrefs();
  const [name, setName] = useState("");
  const q = lib.queue;
  const items = q.ids.map((id) => findItem(id, lib)).filter((i): i is MediaItem => !!i);
  return (
    <>
      <View style={styles.qTools}>
        <Pressable accessibilityRole="button" onPress={() => { tick(); setQueue({ ...q, repeat: Q.cycleRepeat(q.repeat) }); }} style={styles.qTool}>
          <Text style={[textStyles.engrave, { color: room.ink3 }]}>Repeat</Text>
          <Text style={[textStyles.readout, { color: q.repeat === "off" ? room.ink : room.ember }]}>{{ off: "Off", all: "All", one: "One" }[q.repeat]}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { tick(); setQueue(Q.shuffleUpcoming(q)); }} style={styles.qTool}>
          <Text style={[textStyles.engrave, { color: room.ink3 }]}>Shuffle</Text>
          <Text style={[textStyles.readout, { color: room.ink }]}>Upcoming</Text>
        </Pressable>
      </View>
      {/* The queue as a line of stations, as on desktop: the loaded title is "On air". */}
      {items.map((i, n) => {
        const here = n === q.index;
        return (
          <View key={i.id} style={styles.station}>
            <View style={styles.rail}>
              <View style={[styles.railLine, n === 0 && { top: "50%" }, n === items.length - 1 && { bottom: "50%" }]} />
              <View style={[styles.stop, here && styles.stopHere]} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${here ? "On air: " : ""}${i.title}`} onPress={() => { tick(); if (!here) { ctx.act.jump(i.id); close(); } }} style={{ flex: 1, paddingVertical: space.s }}>
              {here && <Text style={[textStyles.engrave, { color: room.ember, fontSize: 9.5 }]}>On air</Text>}
              <Text numberOfLines={1} style={[textStyles.body, { color: here ? room.ink : room.ink2, fontFamily: here ? font.semibold : font.regular }]}>
                {i.title}
              </Text>
            </Pressable>
            <Pressable accessibilityLabel={`Move ${i.title} up`} onPress={() => setQueue(Q.move(getLibrary().queue, i.id, -1))} style={styles.qBtn} hitSlop={2}>
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <ChevronDownIcon color={room.ink3} size={18} />
              </View>
            </Pressable>
            <Pressable accessibilityLabel={`Move ${i.title} down`} onPress={() => setQueue(Q.move(getLibrary().queue, i.id, 1))} style={styles.qBtn} hitSlop={2}>
              <ChevronDownIcon color={room.ink3} size={18} />
            </Pressable>
            {!here && (
              <Pressable accessibilityLabel={`Remove ${i.title} from queue`} onPress={() => setQueue(Q.remove(getLibrary().queue, i.id))} style={styles.qBtn} hitSlop={2}>
                <CloseIcon color={room.ink3} size={18} />
              </Pressable>
            )}
          </View>
        );
      })}
      {items.length <= 1 && <SheetNote>Long-press titles in the library and choose “Add to queue” or “Play next”.</SheetNote>}
      <SheetLabel>Save as playlist</SheetLabel>
      <View style={{ flexDirection: "row", gap: space.m, paddingHorizontal: space.xl }}>
        <TextInput value={name} onChangeText={setName} placeholder="Playlist name" placeholderTextColor={room.ink3} accessibilityLabel="Playlist name" style={[textStyles.body, styles.input]} />
        <Pressable accessibilityRole="button" onPress={() => { if (items.length) { savePlaylist(name || `Queue ${new Date().toLocaleDateString()}`, items.map((i) => i.id)); setName(""); tick("light"); } }} style={styles.go}>
          <Text style={[textStyles.label, { color: room.bg, fontFamily: font.semibold }]}>Save</Text>
        </Pressable>
      </View>
      {prefs.resume === "on" && <SheetNote>Each title resumes where you left it.</SheetNote>}
    </>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, minHeight: TOUCH, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: room.seam, borderRadius: radius.m, paddingHorizontal: space.m, color: room.ink, fontSize: 17 },
  go: { minHeight: TOUCH, paddingHorizontal: space.xl, borderRadius: radius.m, backgroundColor: room.cream, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  qTools: { flexDirection: "row", gap: space.s, paddingHorizontal: space.xl, paddingBottom: space.s },
  qTool: { minHeight: TOUCH, paddingHorizontal: space.m, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: room.seam, borderRadius: radius.m, justifyContent: "center" },
  station: { flexDirection: "row", alignItems: "center", paddingLeft: space.xl, paddingRight: space.s, minHeight: 56 },
  rail: { width: 20, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginRight: space.m },
  railLine: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: room.seam },
  stop: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: room.ink3, backgroundColor: room.bg },
  stopHere: { borderColor: room.ember, backgroundColor: room.ember, width: 12, height: 12, borderRadius: 2, transform: [{ skewX: "-15.3deg" }] },
  qBtn: { width: 40, height: TOUCH, alignItems: "center", justifyContent: "center" },
});

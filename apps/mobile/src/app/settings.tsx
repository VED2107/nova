import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Children, createContext, isValidElement, useContext, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Switch, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDownIcon } from "@/components/icons";
import { Button, Seam, Segmented, T, tick, Touch } from "@/components/ui";
import { clearHistory, removeFolder, useLibrary } from "@/core/library";
import { setPref, usePrefs, type Prefs } from "@/core/prefs";
import { useScheme } from "@/design/theme";
import { UpdateStatus } from "@/features/updates/UpdatePanel";
import { updatesUnsupported } from "@/core/updates";
import { radius, space, TOUCH } from "@/design/tokens";
import { mpvAvailable } from "../../modules/nova-mpv/src";

/** Same sections, order and wording as the Windows Settings dialog; "Keys & mouse" becomes touch. */
const SECTIONS = ["Appearance", "Playback", "Audio & subtitles", "Touch & gestures", "Library & privacy", "Formats", "About"] as const;
const CAPTIONS = Platform.OS === "ios" ? "Settings › Accessibility › Subtitles & Captioning" : "Settings › Accessibility › Caption preferences";

/**
 * The Windows settings, for a phone. A Windows control that the system player
 * cannot honour is shown as an explained row, never as a dead switch.
 */
export default function Settings() {
  const s = useScheme();
  const p = usePrefs();
  const lib = useLibrary();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = Math.max(space.l, (width - 640) / 2 + space.l);
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPref(k, v);
  const onOff = <K extends keyof Prefs>(k: K) => (v: boolean) => setPref(k, (v ? "on" : "off") as Prefs[K]);
  const [query, setQuery] = useState("");
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<Record<string, number>>({});
  /** Android app with NOVA's libmpv engine on: the Windows engine settings apply as they are. */
  const nova = mpvAvailable && p.engine === "nova";
  const scale = Number(p.subScale) || 100;
  const stepScale = (d: number) => setPref("subScale", String(Math.min(300, Math.max(50, scale + d))));

  return (
    <View style={{ flex: 1, backgroundColor: s.paper }}>
      <View style={[styles.bar, { paddingTop: insets.top, paddingHorizontal: gutter - space.m, borderColor: s.seam }]}>
        <Touch accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <ChevronDownIcon color={s.ink} size={24} />
          </View>
        </Touch>
        <T v="title" accessibilityRole="header">
          Settings
        </T>
        <T v="caption" tone="ink3" style={{ marginLeft: "auto", marginRight: space.m }}>
          Changes save as you make them
        </T>
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ paddingHorizontal: gutter }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={s.ink3}
            accessibilityLabel="Search settings"
            clearButtonMode="while-editing"
            autoCorrect={false}
            style={[styles.search, { color: s.ink, backgroundColor: s.paperSunk, borderColor: s.seam }]}
          />
        </View>
        {/* The phone's version of the Windows sidebar: jump to a section. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: s.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: s.seam }} contentContainerStyle={{ paddingHorizontal: gutter - space.xs, gap: space.xs }}>
          {SECTIONS.map((t) => (
            <Touch key={t} accessibilityRole="button" accessibilityLabel={`Go to ${t}`} onPress={() => { setQuery(""); scroll.current?.scrollTo({ y: (tops.current.base ?? 0) + (tops.current[t] ?? 0) - TOUCH - space.l, animated: true }); }} style={styles.chip}>
              <T v="label" tone="ink2">
                {t}
              </T>
            </Touch>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: gutter }} onLayout={(e) => (tops.current.base = e.nativeEvent.layout.y)}>
          <Query.Provider value={query.trim().toLowerCase()}>
            <Tops.Provider value={{ tops: tops.current, seen: new Set() }}>
              <Section title="Appearance">
                <Field label="Theme" help="Home, Library and Settings. The player is always dark. Animations follow the system's Reduce Motion setting.">
                  <Segmented label="Theme" value={p.theme} onChange={set("theme")} options={[{ value: "system", label: "System" }, { value: "light", label: "Daylight" }, { value: "dark", label: "Night" }]} />
                </Field>
                <Field label="Control bar" help="Full: the timeline runs across the player above the buttons. Compact: one slim floating row with the timeline in the middle; everything else is under More. Also in the player's More menu.">
                  <Segmented label="Control bar" value={p.controlBar} onChange={set("controlBar")} options={[{ value: "full", label: "Full" }, { value: "compact", label: "Compact" }]} />
                </Field>
                <Toggle label="Hide controls while playing" help={`Controls fade after ${p.hideDelay} seconds without a touch. Tap the picture to show them.`} value={p.autoHide === "on"} onChange={onOff("autoHide")} />
                {p.autoHide === "on" && (
                  <Field label="Hide after" help="How long the controls stay after a touch.">
                    <Segmented label="Hide controls after" value={p.hideDelay} onChange={set("hideDelay")} options={[{ value: "2", label: "2 s" }, { value: "3", label: "3 s" }, { value: "5", label: "5 s" }, { value: "8", label: "8 s" }]} />
                  </Field>
                )}
                {Platform.OS !== "web" && (
                  <Field label="Orientation" help="When the player opens. The rotate button still turns it either way. Windows: the window size.">
                    <Segmented label="Orientation" value={p.orientation} onChange={set("orientation")} options={[{ value: "auto", label: "Follow phone" }, { value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} />
                  </Field>
                )}
              </Section>

              <Section title="Playback">
                {mpvAvailable && (
                  <Field label="Playback engine" help="NOVA: libmpv and FFmpeg, the engine NOVA uses on Windows — MKV, DTS, TrueHD, ASS and PGS subtitles, delays and subtitle size. Phone's player: Media3, with picture in picture and lock-screen controls. Applies to the next title.">
                    <Segmented label="Playback engine" value={p.engine} onChange={set("engine")} options={[{ value: "nova", label: "NOVA (libmpv)" }, { value: "system", label: "Phone's player" }]} />
                  </Field>
                )}
                {nova ? (
                  <Toggle label="Hardware decoding" help="Uses the phone's video decoder (MediaCodec) when it supports the format and falls back to software automatically. Turn off if you see artefacts." value={p.hwdec === "auto"} onChange={(v) => setPref("hwdec", v ? "auto" : "off")} />
                ) : (
                  <Field label="Hardware decoding" help="Always on: the phone's own player decodes in hardware and falls back by itself. The switch applies to NOVA's libmpv engine (Android app)." />
                )}
                <Toggle label="Resume where you left off" help="Positions are still remembered when off; files simply start from the beginning. The player offers Start over when it resumes." value={p.resume === "on"} onChange={onOff("resume")} />
                <Field label="While dragging the timeline" help="Releasing always lands on the exact frame. Adaptive shows exact frames while the decoder keeps up and switches to keyframes on heavy files.">
                  <Segmented label="Timeline dragging" value={p.scrub} onChange={set("scrub")} options={[{ value: "auto", label: "Adaptive" }, { value: "accurate", label: "Exact frames" }, { value: "fast", label: "Keyframes" }]} />
                </Field>
                <Field label="Time display" help="Also toggled by tapping the time in the player.">
                  <Segmented label="Time display" value={p.timeDisplay} onChange={set("timeDisplay")} options={[{ value: "elapsed", label: "Elapsed" }, { value: "remaining", label: "Remaining" }]} />
                </Field>
                <Field label="Skip amount" help="Skip buttons and double-tap move by this much. Windows: ← → (5 s), with Shift 30 s, Ctrl 60 s.">
                  <Segmented label="Skip amount" value={p.seekStep} onChange={set("seekStep")} options={[{ value: "5", label: "5 s" }, { value: "10", label: "10 s" }, { value: "15", label: "15 s" }, { value: "30", label: "30 s" }]} />
                </Field>
                {Platform.OS !== "web" && (
                  <Toggle label="Keep playing in the background" help="Sound continues with the screen off or in another app, with play, pause and skip in the notification and on headphones. Off: NOVA pauses when you leave it." value={p.background === "on"} onChange={onOff("background")} />
                )}
              </Section>

              <Section title="Audio & subtitles">
                <Field label="Audio language" help="Phone language: when a file has an audio track in your phone's language, NOVA starts with it.">
                  <Segmented label="Audio language" value={p.audioLang} onChange={set("audioLang")} options={[{ value: "file", label: "As the file says" }, { value: "device", label: "Phone language" }]} />
                </Field>
                <Field label="Subtitles when a title opens" help="Phone language: subtitles in your language when the audio is in another one.">
                  <Segmented label="Subtitles when a title opens" value={p.subtitlesStart} onChange={set("subtitlesStart")} options={[{ value: "file", label: "As the file" }, { value: "off", label: "Off" }, { value: "device", label: "Phone language" }]} />
                </Field>
                {nova ? (
                  <Field label="Subtitle size" help="Relative to the size the subtitle file asks for. Also in the player menu.">
                    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel="Subtitle size" accessibilityValue={{ text: `${scale} percent` }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => stepScale(e.nativeEvent.actionName === "increment" ? 10 : -10)}>
                      <Button label="−" onPress={() => stepScale(-10)} />
                      <T v="title" style={{ minWidth: 64, textAlign: "center", fontVariant: ["tabular-nums"] }}>
                        {scale}%
                      </T>
                      <Button label="+" onPress={() => stepScale(10)} />
                      {scale !== 100 && <Button label="Reset" onPress={() => setPref("subScale", "100")} />}
                    </View>
                  </Field>
                ) : (
                  <Field label="Subtitle size" help={`The phone's player draws subtitles in your caption style: ${CAPTIONS}. NOVA's own size control needs its libmpv engine (Android app).`} />
                )}
                <Field
                  label="Timing"
                  help={
                    nova
                      ? "Delays apply to what is playing and are adjusted in 50 ms steps from the player menu (Audio earlier/later, Subtitles earlier/later). They return to zero for the next file. Track switching: tap the Audio or Subtitles readout, hold it for the list."
                      : "Subtitle and audio delays need NOVA's libmpv engine (Android app). Track switching works: tap the Audio or Subtitles readout in the player, or hold it for the list."
                  }
                />
              </Section>

              <Section title="Touch & gestures">
                <Field label="Tap on the picture" help="Windows: click on the picture.">
                  <Segmented label="Tap on the picture" value={p.tapAction} onChange={set("tapAction")} options={[{ value: "controls", label: "Show controls" }, { value: "pause", label: "Play / pause" }]} />
                </Field>
                <Toggle label="Double-tap to skip" help="Double-tap the left or right side of the picture; keep tapping to add. Windows: double-click is fullscreen; on a phone the player already is." value={p.doubleTapSeek === "on"} onChange={onOff("doubleTapSeek")} />
                <Toggle label="Swipe for volume and brightness" help="Swipe up or down on the right of the picture for volume, on the left for brightness. Brightness goes back to normal when you leave the player. Windows: the mouse wheel." value={p.swipeGestures === "on"} onChange={onOff("swipeGestures")} />
                {p.swipeGestures === "on" && (
                  <Field label="Swipe sensitivity" help="High: a short swipe covers the whole range.">
                    <Segmented label="Swipe sensitivity" value={p.swipeSensitivity} onChange={set("swipeSensitivity")} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
                  </Field>
                )}
                {Platform.OS !== "web" && <Toggle label="Haptics" help="A light tick when a seek lands, a toggle changes or fine scrubbing engages." value={p.haptics === "on"} onChange={onOff("haptics")} />}
                <Field label="Keyboard shortcuts" help="Windows lets you rebind every key. Hardware keyboards on phones and tablets are not supported yet; every action is in the player's More menu." />
              </Section>

              <Section title="Library & privacy">
                <Field label="Privacy" help="NOVA works offline. It has no account, sends no telemetry, and never uploads file names or viewing history. The library, positions and settings stay on this phone. The only network request is the update check to GitHub (Android app; can be turned off under About)." />
                <Field label="Watch history" help={`Clears Continue Watching and every resume position (${Object.keys(lib.progress).length} saved). Files and the library are not touched.`}>
                  <View style={{ alignSelf: "flex-start" }}>
                    <Button label="Clear history" onPress={clearHistory} />
                  </View>
                </Field>
                <Field label="Files and folders" help={Platform.OS === "ios" ? "iOS shows NOVA only the files and folders you pick in Files; it cannot scan the phone. A folder is shared until the app closes; titles stay listed." : "Android shows NOVA only the files and folders you pick; no storage permission is asked. NOVA keeps access to picked folders until you remove them."}>
                  {lib.folders.map((f) => (
                    <View key={f.id} style={styles.folder}>
                      <T v="label" numberOfLines={1} style={{ flex: 1 }}>
                        {f.name}
                      </T>
                      <T v="label" tone="ember" accessibilityRole="button" onPress={() => removeFolder(f.id)} style={{ paddingVertical: 12 }}>
                        Remove
                      </T>
                    </View>
                  ))}
                </Field>
              </Section>

              <Section title="Formats">
                <T v="body" tone="ink2" style={{ marginBottom: space.m }}>
                  {nova
                    ? "This app plays through NOVA's own engine, libmpv with FFmpeg, as on Windows: the same containers, codecs and subtitle formats, with the phone's MediaCodec for hardware decoding."
                    : "What plays depends on the engine. This build uses the phone's own player (AVPlayer on iPhone, Media3 on Android). NOVA's libmpv engine, the one Windows uses, is in the Android app."}
                </T>
                <Matrix />
              </Section>

              <Section title="About">
                <T v="title">NOVA</T>
                <T v="label" tone="ink2">
                  by SNOWBROS · version {Constants.expoConfig?.version ?? ""} · {Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android" : "Web preview"} · Expo SDK {Constants.expoConfig?.sdkVersion ?? "57"}
                </T>
                <T v="caption" tone="ink3" style={{ marginTop: space.xs, marginBottom: space.l }}>
                  Playback engine: {nova ? "libmpv with FFmpeg (GPL build, as on Windows)" : Platform.OS === "ios" ? "AVPlayer (system)" : "Media3 ExoPlayer (system)"}. NOVA's own code is MIT OR Apache-2.0.{mpvAvailable ? " This app includes libmpv and FFmpeg built with GPL components, so the app as a whole is distributed under the GPL v3; their source is linked from the release notes." : " This app contains no GPL or LGPL code."} Interface font: Archivo, SIL Open Font License 1.1. Third-party notices: THIRD-PARTY-NOTICES.md in apps/mobile on github.com/VED2107/nova, attached to every release.
                </T>
                {!updatesUnsupported() && <Toggle label="Check for updates automatically" help="At start-up NOVA asks GitHub whether a newer release exists. Nothing about you or your library is sent. Off: only when you tap Check now." value={p.updates === "auto"} onChange={(v) => setPref("updates", v ? "auto" : "manual")} />}
                <View style={{ marginTop: space.m }}>
                  <UpdateStatus />
                </View>
              </Section>
              <NoMatch query={query} />
            </Tops.Provider>
          </Query.Provider>
        </View>
      </ScrollView>
    </View>
  );
}

type Avail = "yes" | "no" | "partial";
const ROWS: { feature: string; go: Avail; dev: Avail; note?: string }[] = [
  { feature: "Library, folders, playlists, queue, history", go: "yes", dev: "yes" },
  { feature: "Gestures, themes, lock, rotation", go: "yes", dev: "yes" },
  { feature: "A–B loop, go to time, aspect, zoom", go: "yes", dev: "yes" },
  { feature: "Frame step", go: "partial", dev: "yes", note: "Phone's player: estimated from the frame rate" },
  { feature: "Exact seek and scrubbing", go: "yes", dev: "yes", note: "NOVA engine reports when a seek lands" },
  { feature: "MP4 / MOV with H.264, HEVC", go: "yes", dev: "yes" },
  { feature: "MKV, WebM, AVI, TS, MXF containers", go: "partial", dev: "yes", note: "Phone's player: MKV/WebM on Android only" },
  { feature: "DTS, TrueHD, ProRes, image subtitles (PGS)", go: "no", dev: "yes" },
  { feature: "ASS/SSA styling, subtitle files", go: "no", dev: "yes" },
  { feature: "Subtitle size, subtitle and audio delay", go: "no", dev: "yes" },
  { feature: "Hardware decoding switch, decoder shown", go: "no", dev: "yes" },
  { feature: "Chapters", go: "no", dev: "yes" },
  { feature: "Picture in picture", go: "yes", dev: "no" },
  { feature: "Background audio", go: "yes", dev: "partial", note: "NOVA engine: keeps playing, no notification controls yet" },
  { feature: "Deinterlace", go: "no", dev: "no", note: "Android libmpv is built without video filters" },
];

function Matrix() {
  const s = useScheme();
  const mark = (a: Avail) => (a === "yes" ? "Yes" : a === "partial" ? "Partly" : "No");
  const tone = (a: Avail) => (a === "yes" ? "ink" : a === "partial" ? "ink2" : "ink3") as "ink" | "ink2" | "ink3";
  return (
    <View style={[styles.matrix, { borderColor: s.seam }]} accessibilityLabel="Feature availability by build">
      <View style={[styles.mRow, { backgroundColor: s.paperSunk }]}>
        <T v="engrave" tone="ink3" style={{ flex: 1 }}>
          Feature
        </T>
        <T v="engrave" tone="ink3" style={styles.mCol}>
          Phone's player
        </T>
        <T v="engrave" tone="ink3" style={styles.mCol}>
          NOVA engine
        </T>
      </View>
      {ROWS.map((r) => (
        <View key={r.feature} style={[styles.mRow, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: s.seam }]} accessible accessibilityLabel={`${r.feature}. Phone's player: ${mark(r.go)}. NOVA engine: ${mark(r.dev)}. ${r.note ?? ""}`}>
          <View style={{ flex: 1 }}>
            <T v="label">{r.feature}</T>
            {r.note && (
              <T v="caption" tone="ink3">
                {r.note}
              </T>
            )}
          </View>
          <T v="label" tone={tone(r.go)} style={styles.mCol}>
            {mark(r.go)}
          </T>
          <T v="label" tone={tone(r.dev)} style={styles.mCol}>
            {mark(r.dev)}
          </T>
        </View>
      ))}
      <View style={[styles.mRow, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: s.seam }]}>
        <T v="caption" tone="ink3" style={{ flex: 1 }}>
          “NOVA engine” is libmpv, in the Android app (not in Expo Go or on iPhone). “Phone's player” is Media3 on Android and AVPlayer on iPhone.
        </T>
      </View>
    </View>
  );
}

const Query = createContext("");
/** Section positions for the jump bar, and which sections the current search shows. */
const Tops = createContext<{ tops: Record<string, number>; seen: Set<string> }>({ tops: {}, seen: new Set() });
const hit = (q: string, ...text: unknown[]) => !q || text.some((t) => typeof t === "string" && t.toLowerCase().includes(q));

function Section({ title, children }: { title: string; children: ReactNode }) {
  const q = useContext(Query);
  const at = useContext(Tops);
  const all = hit(q, title);
  if (!all && !Children.toArray(children).some((c) => isValidElement<{ label?: string; help?: string }>(c) && hit(q, c.props.label, c.props.help))) return null;
  at.seen.add(title);
  return (
    <Query.Provider value={all ? "" : q}>
    <View style={{ marginTop: space.xxl }} onLayout={(e) => (at.tops[title] = e.nativeEvent.layout.y)}>
      <T v="engrave" tone="ink3" accessibilityRole="header" style={{ marginBottom: space.m }}>
        {title}
      </T>
      {children}
    </View>
    </Query.Provider>
  );
}

/** Rendered after the sections, so it knows whether any matched. */
function NoMatch({ query }: { query: string }) {
  const { seen } = useContext(Tops);
  if (!query.trim() || seen.size > 0) return null;
  return (
    <T v="body" tone="ink2" style={{ marginTop: space.xxl }}>
      No setting matches “{query.trim()}”.
    </T>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children?: ReactNode }) {
  if (!hit(useContext(Query), label, help)) return null;
  return (
    <View style={{ marginBottom: space.xl }}>
      <T v="title">{label}</T>
      {help && (
        <T v="label" tone="ink2" style={{ marginTop: 2, marginBottom: space.s }}>
          {help}
        </T>
      )}
      {!help && <View style={{ height: space.s }} />}
      {children}
    </View>
  );
}

function Toggle({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  const s = useScheme();
  if (!hit(useContext(Query), label, help)) return null;
  return (
    <>
      <View style={styles.toggle}>
        <View style={{ flex: 1 }}>
          <T v="title">{label}</T>
          {help && (
            <T v="label" tone="ink2" style={{ marginTop: 2 }}>
              {help}
            </T>
          )}
        </View>
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={(v) => {
            tick();
            onChange(v);
          }}
          trackColor={{ true: s.ember, false: s.seamStrong }}
          thumbColor={Platform.OS === "ios" ? undefined : s.paperRaised}
          ios_backgroundColor={s.seamStrong}
        />
      </View>
      <Seam />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TOUCH },
  search: { marginTop: space.l, minHeight: TOUCH, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.m, fontSize: 16 },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  chip: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: space.m, borderRadius: radius.m },
  back: { width: TOUCH, alignItems: "center", borderRadius: radius.m },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.l, paddingVertical: space.m, minHeight: TOUCH + 12 },
  matrix: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.m, overflow: "hidden" },
  mRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, paddingVertical: 10 },
  mCol: { width: 72, textAlign: "center" },
  folder: { flexDirection: "row", alignItems: "center", gap: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(128,128,128,0.25)" },
});

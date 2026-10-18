import Constants from "expo-constants";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDownIcon } from "@/components/icons";
import { Button, Seam, Segmented, T, tick, Touch } from "@/components/ui";
import { clearHistory, removeFolder, useLibrary } from "@/core/library";
import { setPref, usePrefs, type Prefs } from "@/core/prefs";
import { useScheme } from "@/design/theme";
import { radius, space, TOUCH } from "@/design/tokens";

/**
 * Only settings that mean something on a phone. Each one says what it does;
 * features the system engine cannot do are listed under "Engines & formats"
 * instead of being shown as dead switches.
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
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.xxl }}>
        <Section title="Seeking">
          <Field label="Skip amount" help="Skip buttons and double-tap move by this much.">
            <Segmented label="Skip amount" value={p.seekStep} onChange={set("seekStep")} options={[{ value: "5", label: "5 s" }, { value: "10", label: "10 s" }, { value: "15", label: "15 s" }, { value: "30", label: "30 s" }]} />
          </Field>
          <Field label="While dragging the timeline" help="Releasing always lands on the exact frame. Adaptive shows exact frames while the decoder keeps up.">
            <Segmented label="Timeline dragging" value={p.scrub} onChange={set("scrub")} options={[{ value: "auto", label: "Adaptive" }, { value: "accurate", label: "Exact" }, { value: "fast", label: "Keyframes" }]} />
          </Field>
          <Toggle label="Double-tap to skip" help="Double-tap the left or right side of the picture. Single taps still show and hide controls." value={p.doubleTapSeek === "on"} onChange={(v) => setPref("doubleTapSeek", v ? "on" : "off")} />
          <Toggle label="Swipe for volume and brightness" help="Swipe up or down on the right of the picture for volume, on the left for brightness. Brightness goes back to normal when you leave the player." value={p.swipeGestures === "on"} onChange={(v) => setPref("swipeGestures", v ? "on" : "off")} />
          <Toggle label="Resume where you left off" help="Positions are still remembered when off." value={p.resume === "on"} onChange={(v) => setPref("resume", v ? "on" : "off")} />
        </Section>

        <Section title="Appearance">
          <Field label="Theme" help="The player is always dark; this sets the library and settings.">
            <Segmented label="Theme" value={p.theme} onChange={set("theme")} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </Field>
          <Field label="Time display">
            <Segmented label="Time display" value={p.timeDisplay} onChange={set("timeDisplay")} options={[{ value: "elapsed", label: "Total length" }, { value: "remaining", label: "Remaining" }]} />
          </Field>
          {Platform.OS !== "web" && <Toggle label="Haptics" help="A light tick when a seek lands, a toggle changes or fine scrubbing engages." value={p.haptics === "on"} onChange={(v) => setPref("haptics", v ? "on" : "off")} />}
        </Section>

        <Section title="Engines & formats">
          <T v="body" tone="ink2" style={{ marginBottom: space.m }}>
            NOVA plays through your phone’s own decoders (AVPlayer on iPhone, Media3 on Android). NOVA’s own engine (libmpv, the one the Windows app uses) runs only in a development or store build, not in Expo Go. What works where:
          </T>
          <Matrix />
        </Section>

        <Section title="Library & privacy">
          <Field label="Watch history" help={`${Object.keys(lib.progress).length} saved positions. Clearing them does not remove titles or files.`}>
            <View style={{ alignSelf: "flex-start" }}>
              <Button label="Clear watch history" onPress={clearHistory} />
            </View>
          </Field>
          {lib.folders.length > 0 && (
            <Field label="Folders" help={Platform.OS === "ios" ? "iOS shares a folder with NOVA until the app closes. Titles stay listed; add the folder again to open them later." : "NOVA keeps access to these folders until you remove them."}>
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
          )}
        </Section>

        <Section title="Privacy">
          <T v="body" tone="ink2">
            No account, no analytics, no network requests from NOVA. Files you open stay on this device; NOVA keeps only titles, positions and settings, locally.
          </T>
          <T v="caption" tone="ink3" style={{ marginTop: space.s }}>
            In development, Expo Go loads this app from your computer over the local network.
          </T>
        </Section>

        <Section title="About">
          <T v="label" tone="ink2">
            NOVA for mobile {Constants.expoConfig?.version ?? ""} · Expo SDK {Constants.expoConfig?.sdkVersion ?? "57"}
          </T>
          <T v="caption" tone="ink3" style={{ marginTop: space.xs }}>
            NOVA is MIT OR Apache-2.0 and contains no GPL or LGPL code. Archivo is licensed under the SIL Open Font License 1.1. The test card is generated with FFmpeg; it contains no third-party footage. Third-party notices: THIRD-PARTY-NOTICES.md in apps/mobile on github.com/VED2107/nova.
          </T>
        </Section>
      </ScrollView>
    </View>
  );
}

type Avail = "yes" | "no" | "partial";
const ROWS: { feature: string; go: Avail; dev: Avail; note?: string }[] = [
  { feature: "Library, folders, playlists, queue, history", go: "yes", dev: "yes" },
  { feature: "Gestures, themes, lock, rotation, PiP", go: "yes", dev: "yes" },
  { feature: "A–B loop, frame step, go to time, aspect", go: "yes", dev: "yes", note: "A–B and frame step driven by NOVA (±1 time update)" },
  { feature: "MP4 / MOV with H.264, HEVC", go: "yes", dev: "yes", note: "System decoders" },
  { feature: "Exact seek and scrubbing", go: "yes", dev: "yes", note: "Landing time inferred in Expo Go" },
  { feature: "Timeline preview frames", go: "yes", dev: "yes" },
  { feature: "Embedded audio/subtitle tracks", go: "partial", dev: "yes", note: "Text subtitles the OS supports" },
  { feature: "MKV, WebM, AVI containers", go: "partial", dev: "yes", note: "Android only in Expo Go" },
  { feature: "DTS, TrueHD, image subtitles (PGS)", go: "no", dev: "yes", note: "Needs libmpv build" },
  { feature: "Subtitle size, position, delay", go: "no", dev: "yes" },
  { feature: "Decoder choice and diagnostics", go: "no", dev: "yes" },
  { feature: "Background audio, lock-screen controls", go: "no", dev: "partial", note: "Planned; not built yet" },
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
          Expo Go
        </T>
        <T v="engrave" tone="ink3" style={styles.mCol}>
          Dev build
        </T>
      </View>
      {ROWS.map((r) => (
        <View key={r.feature} style={[styles.mRow, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: s.seam }]} accessible accessibilityLabel={`${r.feature}. Expo Go: ${mark(r.go)}. Development build: ${mark(r.dev)}. ${r.note ?? ""}`}>
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
          “Dev build” is the plan for the libmpv engine module (milestone M2); it is not built yet and has not been tested on a device.
        </T>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.xxl }}>
      <T v="engrave" tone="ink3" accessibilityRole="header" style={{ marginBottom: space.m }}>
        {title}
      </T>
      {children}
    </View>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
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
  back: { width: TOUCH, alignItems: "center", borderRadius: radius.m },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.l, paddingVertical: space.m, minHeight: TOUCH + 12 },
  matrix: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.m, overflow: "hidden" },
  mRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, paddingVertical: 10 },
  mCol: { width: 64, textAlign: "center" },
  folder: { flexDirection: "row", alignItems: "center", gap: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(128,128,128,0.25)" },
});

import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileIcon, SettingsIcon, Wordmark } from "@/components/icons";
import { T, tick, Touch } from "@/components/ui";
import { findItem, useLibrary, type MediaItem } from "@/core/library";
import * as Q from "@/core/queue";
import { useScheme } from "@/design/theme";
import { font, radius, space, TOUCH } from "@/design/tokens";
import { HomeView } from "@/features/home/HomeView";
import { openFiles, openFolder } from "@/features/library/actions";
import { ItemMenu } from "@/features/library/ItemMenu";
import { LibraryView } from "@/features/library/LibraryView";
import { play } from "@/features/library/actions";

/**
 * The app frame, as on desktop: NOVA wordmark, Home and Library tabs, the
 * last title in the queue as a chip (desktop: the PLAYING chip), settings
 * and Open file. On a phone the tabs sit on their own row under the bar.
 */
export default function Shell() {
  const s = useScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lib = useLibrary();
  const [tab, setTab] = useState<"home" | "library">("home");
  const [menu, setMenu] = useState<MediaItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gutter = Math.max(space.l, (width - 1100) / 2 + space.l, insets.left, insets.right);
  const narrow = width < 600;
  const queued = Q.current(lib.queue);
  const onAir = queued ? findItem(queued, lib) : undefined;

  const addFiles = async () => {
    const err = await openFiles();
    if (err) setNotice(err);
  };
  const addFolder = async () => {
    const r = await openFolder();
    setNotice(r.error ?? (r.added ? `Added ${r.added} ${r.added === 1 ? "title" : "titles"}.` : null));
    if (r.added) setTab("library");
  };

  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(["home", "library"] as const).map((t) => (
        <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => { tick(); setTab(t); }} style={styles.tab}>
          <T v="label" style={{ fontFamily: font.semibold, color: tab === t ? s.ink : s.ink2, fontSize: 15 }}>
            {t === "home" ? "Home" : "Library"}
          </T>
          <View style={[styles.underline, { backgroundColor: tab === t ? s.ink : "transparent" }]} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: s.paper }}>
      <View style={[styles.bar, { paddingTop: insets.top, paddingHorizontal: gutter, borderColor: s.seam }]}>
        <View style={styles.barRow}>
          <Wordmark height={20} ink={s.ink} />
          {!narrow && tabs}
          <View style={{ flex: 1 }} />
          {onAir && !narrow && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Up next: ${onAir.title}. Open player`} onPress={() => play(onAir)} style={[styles.chip, { borderColor: s.seamStrong }]}>
              <View style={[styles.lamp, { backgroundColor: s.ember }]} />
              <T v="engrave" tone="ink3" style={{ fontSize: 10 }}>
                Up next
              </T>
              <T v="label" numberOfLines={1} style={{ fontFamily: font.semibold, maxWidth: 220 }}>
                {onAir.title}
              </T>
            </Pressable>
          )}
          <Touch accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push("/settings")} style={styles.icon}>
            <SettingsIcon color={s.ink2} size={24} />
          </Touch>
          <Pressable accessibilityRole="button" accessibilityLabel="Open file" onPress={() => { tick(); void addFiles(); }} style={({ pressed }) => [styles.open, { backgroundColor: s.ember, opacity: pressed ? 0.85 : 1 }]}>
            <FileIcon color={s.onEmber} size={18} />
            <T v="label" style={{ color: s.onEmber, fontFamily: font.semibold }}>
              Open file
            </T>
          </Pressable>
        </View>
        {narrow && tabs}
      </View>

      {notice && (
        <Pressable onPress={() => setNotice(null)} accessibilityRole="button" accessibilityLabel={`${notice}. Dismiss`} style={[styles.notice, { backgroundColor: s.ink, marginHorizontal: gutter }]}>
          <T v="label" style={{ color: s.paper, flex: 1 }}>
            {notice}
          </T>
          <T v="label" style={{ color: s.paper, fontFamily: font.semibold }}>
            OK
          </T>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {narrow && onAir && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Up next: ${onAir.title}. Open player`} onPress={() => play(onAir)} style={[styles.chip, styles.chipWide, { borderColor: s.seamStrong, marginHorizontal: gutter }]}>
            <View style={[styles.lamp, { backgroundColor: s.ember }]} />
            <T v="engrave" tone="ink3" style={{ fontSize: 10 }}>
              Up next
            </T>
            <T v="label" numberOfLines={1} style={{ fontFamily: font.semibold, flex: 1 }}>
              {onAir.title}
            </T>
          </Pressable>
        )}
        {tab === "home" ? (
          <HomeView gutter={gutter} onBrowse={() => setTab("library")} onAddFolder={addFolder} onAddFiles={addFiles} onMenu={setMenu} />
        ) : (
          <LibraryView gutter={gutter} onAddFolder={addFolder} onMenu={setMenu} />
        )}
      </ScrollView>

      <ItemMenu item={menu} onClose={() => setMenu(null)} onPlay={(i) => play(i)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 56 },
  tabs: { flexDirection: "row", gap: space.l, marginLeft: space.l },
  tab: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 2 },
  underline: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },
  icon: { width: TOUCH, alignItems: "center", borderRadius: radius.m },
  open: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: space.m, borderRadius: radius.m },
  chip: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 40, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth * 2 },
  chipWide: { marginTop: space.l },
  lamp: { width: 8, height: 8, borderRadius: 1 },
  notice: { flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, borderRadius: radius.m, marginTop: space.s },
});

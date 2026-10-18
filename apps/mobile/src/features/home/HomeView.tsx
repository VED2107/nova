import { useMemo } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { FolderIcon, PlayIcon, PlusIcon } from "@/components/icons";
import { Button, Seam, T, Tag, tick } from "@/components/ui";
import { allItems, catalogNumber, pictureLabel, resumePoint, TEST_CARD, useLibrary, type MediaItem } from "@/core/library";
import { formatBytes, formatTime } from "@/core/time";
import { useScheme } from "@/design/theme";
import { font, radius, space } from "@/design/tokens";
import { play, playPlaylist } from "../library/actions";
import { Poster } from "../library/Poster";

/**
 * Home, as on desktop: Continue (the title in progress, or the test card),
 * Your shelf (folders on this phone, add folder, browse), Recently added,
 * and saved playlists. Phone: one column; landscape and tablet: two.
 */
export function HomeView({ gutter, onBrowse, onAddFolder, onAddFiles, onMenu }: { gutter: number; onBrowse: () => void; onAddFolder: () => void; onAddFiles: () => void; onMenu: (i: MediaItem) => void }) {
  const s = useScheme();
  const lib = useLibrary();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 1100) - gutter * 2;
  const wide = inner >= 700;
  const items = useMemo(() => allItems(lib), [lib]);
  const cont = useMemo(
    () =>
      items
        .filter((i) => resumePoint(lib.progress[i.id]) != null && !lib.missing[i.id])
        .sort((a, b) => (lib.progress[b.id]?.playedAt ?? 0) - (lib.progress[a.id]?.playedAt ?? 0))[0] ?? null,
    [items, lib],
  );
  const hero = cont ?? TEST_CARD;
  const recent = useMemo(() => [...lib.items].sort((a, b) => b.addedAt - a.addedAt).slice(0, wide ? 8 : 6), [lib.items, wide]);
  const cols = inner >= 900 ? 4 : inner >= 560 ? 3 : 2;
  const cardW = (inner - space.l * (cols - 1)) / cols;
  const heroW = wide ? inner * 0.62 - space.xl : inner;

  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: space.xxl }}>
      <View style={[wide && { flexDirection: "row", gap: space.xl, alignItems: "flex-start" }]}>
        <View style={{ flex: wide ? 1 : undefined }}>
          <SectionHead title={cont ? "Continue" : "Start here"} />
          <ContinueCard item={hero} width={wide ? heroW * 0.55 : heroW} wide={wide} onPlay={() => play(hero, cont ? undefined : [hero])} />
        </View>
        <Shelf wide={wide} onBrowse={onBrowse} onAddFolder={onAddFolder} onAddFiles={onAddFiles} />
      </View>

      <SectionHead title="Recently added" link={lib.items.length > 0 ? { label: "Whole library", onPress: onBrowse } : undefined} />
      {recent.length === 0 ? (
        <View style={[styles.empty, { borderColor: s.seamStrong }]}>
          <T v="title">Nothing added yet</T>
          <T v="body" tone="ink2" style={{ marginTop: 4 }}>
            Add a folder to keep its videos here, or open files to play them now. NOVA reads them in place and never uploads anything.
          </T>
          <View style={styles.emptyActions}>
            <View style={{ flex: 1 }}>
              <Button kind="ember" label="Add folder" icon={<FolderIcon color={s.onEmber} size={20} />} onPress={onAddFolder} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Open files" icon={<PlusIcon color={s.ink} size={20} />} onPress={onAddFiles} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.grid}>
          {recent.map((i) => (
            <Card key={i.id} item={i} width={cardW} onPress={() => play(i, recent)} onLong={() => onMenu(i)} />
          ))}
        </View>
      )}

      {lib.playlists.length > 0 && (
        <>
          <SectionHead title="Playlists" />
          {lib.playlists.map((p, n) => (
            <View key={p.id}>
              {n > 0 && <Seam />}
              <Pressable accessibilityRole="button" accessibilityLabel={`Play playlist ${p.name}, ${p.ids.length} titles`} onPress={() => { tick(); playPlaylist(p.id); }} style={({ pressed }) => [styles.plRow, pressed && { backgroundColor: s.press }]}>
                <View style={[styles.plBadge, { backgroundColor: s.ink }]}>
                  <PlayIcon color={s.paper} size={16} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="title">{p.name}</T>
                  <T v="caption" tone="ink3">
                    {p.ids.length} {p.ids.length === 1 ? "title" : "titles"}
                  </T>
                </View>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SectionHead({ title, link }: { title: string; link?: { label: string; onPress: () => void } }) {
  const s = useScheme();
  return (
    <View style={[styles.head, { borderColor: s.ink }]}>
      <T v="heading" accessibilityRole="header" style={{ fontFamily: font.spine, fontSize: 26, lineHeight: 30 }}>
        {title}
      </T>
      {link && (
        <T v="label" tone="ember" accessibilityRole="link" onPress={link.onPress} style={{ fontFamily: font.semibold, paddingVertical: 8 }}>
          {link.label}
        </T>
      )}
    </View>
  );
}

function ContinueCard({ item, width, wide, onPlay }: { item: MediaItem; width: number; wide: boolean; onPlay: () => void }) {
  const s = useScheme();
  const lib = useLibrary();
  const p = lib.progress[item.id];
  const dur = item.durationMs ?? lib.durations[item.id];
  const pct = p && p.durationMs > 0 ? p.positionMs / p.durationMs : 0;
  const left = p ? Math.max(0, p.durationMs - p.positionMs) : null;
  const meta = [pictureLabel(lib.facts[item.id]), dur ? formatTime(dur) : null, item.sizeBytes ? formatBytes(item.sizeBytes) : null, lib.folders.find((f) => f.id === item.folderId)?.name ?? (item.kind === "bundled" ? "built in" : null)].filter(Boolean).join(" · ");
  return (
    <View style={[wide && { flexDirection: "row", gap: space.xl, alignItems: "center" }]}>
      <Pressable onPress={onPlay} accessibilityRole="button" accessibilityLabel={`${p ? "Resume" : "Play"} ${item.title}`}>
        <Poster item={item} width={width} progress={pct} />
      </Pressable>
      <View style={{ flex: wide ? 1 : undefined, marginTop: wide ? 0 : space.l }}>
        <View style={styles.tags}>
          <T v="engrave" tone="ink3">
            {catalogNumber(item.id, lib)}
          </T>
          <Tag tone="ember">{p ? "In progress" : item.kind === "bundled" ? "Test card" : "New"}</Tag>
        </View>
        <T v="display" numberOfLines={2} style={{ marginTop: space.s }}>
          {item.title}
        </T>
        {meta ? (
          <T v="label" tone="ink2" style={{ marginTop: 4 }}>
            {meta}
          </T>
        ) : null}
        {p && left != null && (
          <View style={styles.progressRow}>
            <View style={[styles.progress, { backgroundColor: s.seamStrong }]}>
              <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: s.ember }} />
            </View>
            <T v="readout" tone="ink2">
              {left < 60_000 ? "<1 min left" : `${Math.round(left / 60_000)} min left`}
            </T>
          </View>
        )}
        <View style={{ marginTop: space.l, alignSelf: "flex-start", minWidth: 150 }}>
          <Button kind="ember" label={p ? "Resume" : "Play"} icon={<PlayIcon color={s.onEmber} size={16} />} onPress={onPlay} />
        </View>
        {item.kind === "bundled" && !p && (
          <T v="caption" tone="ink3" style={{ marginTop: space.s }}>
            Every frame shows its own number, so you can check where a seek lands.
          </T>
        )}
      </View>
    </View>
  );
}

function Shelf({ wide, onBrowse, onAddFolder, onAddFiles }: { wide: boolean; onBrowse: () => void; onAddFolder: () => void; onAddFiles: () => void }) {
  const s = useScheme();
  const lib = useLibrary();
  const count = (id: string) => lib.items.filter((i) => i.folderId === id).length;
  const files = lib.items.filter((i) => i.kind === "file").length;
  return (
    <View style={[styles.shelf, { backgroundColor: s.paperSunk, borderColor: s.seam }, wide ? { width: 300, marginTop: space.xxl + 6 } : { marginTop: space.xl }]}>
      <T v="heading" style={{ fontFamily: font.spine, fontSize: 22 }}>
        Your shelf
      </T>
      <T v="label" tone="ink3" style={{ marginTop: 2 }}>
        {lib.items.length} {lib.items.length === 1 ? "title" : "titles"} in {lib.folders.length} {lib.folders.length === 1 ? "folder" : "folders"}, on this phone only
      </T>
      <View style={{ marginTop: space.m }}>
        {lib.folders.map((f) => (
          <View key={f.id} style={styles.folderRow}>
            <FolderIcon color={s.ink2} size={20} />
            <T v="label" numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold }}>
              {f.name}
            </T>
            <T v="readout" tone="ink3">
              {count(f.id)}
            </T>
          </View>
        ))}
        {files > 0 && (
          <View style={styles.folderRow}>
            <PlusIcon color={s.ink2} size={20} />
            <T v="label" style={{ flex: 1, fontFamily: font.semibold }}>
              Opened files
            </T>
            <T v="readout" tone="ink3">
              {files}
            </T>
          </View>
        )}
      </View>
      <Seam />
      <View style={{ flexDirection: "row", gap: space.s, marginTop: space.m, flexWrap: "wrap" }}>
        <Button label="Add folder" icon={<PlusIcon color={s.ink} size={18} />} onPress={onAddFolder} />
        <Button label="Open files" onPress={onAddFiles} />
      </View>
      <T v="label" tone="ink2" accessibilityRole="link" onPress={onBrowse} style={{ marginTop: space.s, paddingVertical: 10, fontFamily: font.semibold }}>
        Browse library
      </T>
    </View>
  );
}

function Card({ item, width, onPress, onLong }: { item: MediaItem; width: number; onPress: () => void; onLong: () => void }) {
  const lib = useLibrary();
  const p = lib.progress[item.id];
  const dur = item.durationMs ?? lib.durations[item.id];
  const meta = [pictureLabel(lib.facts[item.id]), dur ? formatTime(dur) : null, item.sizeBytes ? formatBytes(item.sizeBytes) : null].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={() => { tick(); onPress(); }} onLongPress={() => { tick("medium"); onLong(); }} accessibilityRole="button" accessibilityLabel={`${item.title}. ${meta}`} accessibilityHint="Long press for more" style={{ width }}>
      <Poster item={item} width={width} progress={p ? p.positionMs / p.durationMs : 0} missing={!!lib.missing[item.id]} />
      <View style={styles.cardHead}>
        <T v="label" numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold }}>
          {item.title}
        </T>
        <T v="engrave" tone="ink3" style={{ fontSize: 9.5 }}>
          {catalogNumber(item.id, lib)}
        </T>
      </View>
      {meta ? (
        <T v="caption" tone="ink3" numberOfLines={1}>
          {meta}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.5, paddingBottom: 6, marginTop: space.xxl, marginBottom: space.l },
  tags: { flexDirection: "row", alignItems: "center", gap: space.s },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.m },
  progress: { flex: 1, height: 3, borderRadius: 1.5, overflow: "hidden" },
  shelf: { borderRadius: radius.l, padding: space.xl, borderWidth: StyleSheet.hairlineWidth },
  folderRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.l },
  cardHead: { flexDirection: "row", alignItems: "baseline", gap: space.s, marginTop: space.s },
  empty: { borderWidth: StyleSheet.hairlineWidth * 2, borderStyle: "dashed", borderRadius: radius.l, padding: space.xl },
  emptyActions: { flexDirection: "row", gap: space.m, marginTop: space.l },
  plRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 60 },
  plBadge: { width: 36, height: 36, borderRadius: 4, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
});

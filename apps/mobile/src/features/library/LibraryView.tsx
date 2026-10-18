import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { CloseIcon, GridIcon, ListIcon, MoreIcon, PlayIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { Button, Seam, T, textStyles, tick } from "@/components/ui";
import { allItems, catalogNumber, deletePlaylist, matches, pictureLabel, removeFolder, sortItems, useLibrary, type MediaItem } from "@/core/library";
import { checkExists } from "@/core/media";
import { formatBytes, formatTime } from "@/core/time";
import { useScheme } from "@/design/theme";
import { font, radius, space, TOUCH } from "@/design/tokens";
import { play, playPlaylist } from "./actions";
import { Poster } from "./Poster";

type Scope = { kind: "all" } | { kind: "folder"; id: string } | { kind: "files" } | { kind: "playlist"; id: string };
type Order = "az" | "newest" | "recent";

/**
 * Library, as on desktop: folders (here a row of chips instead of a side
 * column), the title, search, A–Z / Newest, Missing files, grid or list.
 */
export function LibraryView({ gutter, onAddFolder, onMenu }: { gutter: number; onAddFolder: () => void; onMenu: (i: MediaItem) => void }) {
  const s = useScheme();
  const lib = useLibrary();
  const { width } = useWindowDimensions();
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [order, setOrder] = useState<Order>("az");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [grid, setGrid] = useState(false);
  const inner = Math.min(width, 1100) - gutter * 2;

  const playlist = scope.kind === "playlist" ? lib.playlists.find((p) => p.id === scope.id) : undefined;
  const items = useMemo(() => {
    const all = allItems(lib);
    let base: MediaItem[];
    if (scope.kind === "folder") base = all.filter((i) => i.folderId === scope.id);
    else if (scope.kind === "files") base = all.filter((i) => i.kind === "file");
    else if (scope.kind === "playlist") base = (playlist?.ids ?? []).map((id) => all.find((i) => i.id === id)).filter((i): i is MediaItem => !!i);
    else base = all;
    base = base.filter((i) => matches(i, query) && (!missingOnly || lib.missing[i.id]));
    if (scope.kind === "playlist") return base; // playlist order is the user's
    return sortItems(base, order === "az" ? "title" : order === "newest" ? "added" : "recent", lib.progress);
  }, [lib, scope, query, missingOnly, order, playlist]);

  const checkMissing = () => {
    tick();
    allItems(lib).forEach(checkExists);
    setMissingOnly((v) => !v);
  };

  const cols = inner >= 900 ? 4 : inner >= 560 ? 3 : 2;
  const cardW = (inner - space.l * (cols - 1)) / cols;
  const files = lib.items.filter((i) => i.kind === "file").length;
  const title = scope.kind === "playlist" ? (playlist?.name ?? "Playlist") : scope.kind === "folder" ? (lib.folders.find((f) => f.id === scope.id)?.name ?? "Folder") : scope.kind === "files" ? "Opened files" : "Library";

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: space.s, paddingTop: space.l }}>
        <Chip label="All folders" count={allItems(lib).length} on={scope.kind === "all"} onPress={() => setScope({ kind: "all" })} />
        {lib.folders.map((f) => (
          <Chip key={f.id} label={f.name} count={lib.items.filter((i) => i.folderId === f.id).length} on={scope.kind === "folder" && scope.id === f.id} onPress={() => setScope({ kind: "folder", id: f.id })} />
        ))}
        {files > 0 && <Chip label="Opened files" count={files} on={scope.kind === "files"} onPress={() => setScope({ kind: "files" })} />}
        {lib.playlists.map((p) => (
          <Chip key={p.id} label={`♪ ${p.name}`} count={p.ids.length} on={scope.kind === "playlist" && scope.id === p.id} onPress={() => setScope({ kind: "playlist", id: p.id })} />
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Add folder" onPress={onAddFolder} style={[styles.chip, styles.addChip, { borderColor: s.seamStrong }]}>
          <PlusIcon color={s.ink2} size={20} />
        </Pressable>
      </ScrollView>

      <View style={{ paddingHorizontal: gutter }}>
        <View style={styles.titleRow}>
          <T v="display" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </T>
          <T v="label" tone="ink3">
            {items.length} {items.length === 1 ? "title" : "titles"}
          </T>
        </View>

        {(scope.kind === "folder" || scope.kind === "playlist") && (
          <View style={styles.scopeActions}>
            {items.length > 0 && <Button kind="ember" label={scope.kind === "playlist" ? "Play playlist" : "Play folder"} icon={<PlayIcon color={s.onEmber} size={16} />} onPress={() => (scope.kind === "playlist" ? playPlaylist(scope.id) : play(items[0]!, items))} />}
            <Button
              label={scope.kind === "playlist" ? "Delete playlist" : "Remove folder"}
              icon={<TrashIcon color={s.ink} size={18} />}
              onPress={() => {
                if (scope.kind === "playlist") deletePlaylist(scope.id);
                else removeFolder(scope.id);
                setScope({ kind: "all" });
              }}
            />
          </View>
        )}
        {scope.kind === "folder" && lib.folders.find((f) => f.id === scope.id)?.sessionOnly && (
          <T v="caption" tone="ink3" style={{ marginBottom: space.s }}>
            iOS lets NOVA read this folder until the app is closed. Titles stay listed; if one will not open later, add the folder again.
          </T>
        )}

        <View style={[styles.search, { backgroundColor: s.paperRaised, borderColor: s.seamStrong }]}>
          <SearchIcon color={s.ink3} size={20} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search titles and folders" placeholderTextColor={s.ink3} accessibilityLabel="Search library" returnKeyType="search" style={[textStyles.body, { flex: 1, color: s.ink, paddingVertical: 10 }]} />
          {query.length > 0 && (
            <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={10}>
              <CloseIcon color={s.ink3} size={18} />
            </Pressable>
          )}
        </View>

        <View style={styles.tools}>
          {scope.kind !== "playlist" && (
            <View style={[styles.seg, { borderColor: s.seamStrong }]} accessibilityRole="radiogroup" accessibilityLabel="Order">
              {(
                [
                  ["az", "A–Z"],
                  ["newest", "Newest"],
                  ["recent", "Recent"],
                ] as const
              ).map(([v, l]) => (
                <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: order === v }} onPress={() => { tick(); setOrder(v); }} style={[styles.segItem, order === v && { backgroundColor: s.ink }]}>
                  <T v="label" style={{ fontFamily: font.semibold, color: order === v ? s.paper : s.ink2 }}>
                    {l}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: missingOnly }} onPress={checkMissing} style={[styles.pill, { borderColor: missingOnly ? s.ink : s.seamStrong, backgroundColor: missingOnly ? s.ink : "transparent" }]}>
            <T v="label" style={{ fontFamily: font.semibold, color: missingOnly ? s.paper : s.ink2 }}>
              Missing files
            </T>
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={[styles.seg, { borderColor: s.seamStrong }]}>
            <Pressable accessibilityRole="radio" accessibilityLabel="Grid" accessibilityState={{ checked: grid }} onPress={() => setGrid(true)} style={[styles.segIcon, grid && { backgroundColor: s.ink }]}>
              <GridIcon color={grid ? s.paper : s.ink2} size={20} />
            </Pressable>
            <Pressable accessibilityRole="radio" accessibilityLabel="List" accessibilityState={{ checked: !grid }} onPress={() => setGrid(false)} style={[styles.segIcon, !grid && { backgroundColor: s.ink }]}>
              <ListIcon color={!grid ? s.paper : s.ink2} size={20} />
            </Pressable>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={{ paddingVertical: space.xxl }}>
            <T v="title">{query ? `Nothing matches “${query}”` : missingOnly ? "No missing files" : "No titles here yet"}</T>
            <T v="body" tone="ink2" style={{ marginTop: 4 }}>
              {query ? "Search looks at titles and format names, such as “MP4”." : missingOnly ? "Every title NOVA knows about can still be opened." : "Add a folder with the + chip, or open files from Home."}
            </T>
          </View>
        ) : grid ? (
          <View style={styles.grid}>
            {items.map((i) => (
              <Pressable key={i.id} style={{ width: cardW }} onPress={() => { tick(); play(i, items); }} onLongPress={() => { tick("medium"); onMenu(i); }} accessibilityRole="button" accessibilityLabel={i.title} accessibilityHint="Long press for more">
                <Poster item={i} width={cardW} progress={progressOf(lib, i)} missing={!!lib.missing[i.id]} />
                <T v="label" numberOfLines={1} style={{ fontFamily: font.semibold, marginTop: space.s }}>
                  {i.title}
                </T>
                <T v="caption" tone="ink3" numberOfLines={1}>
                  {catalogNumber(i.id, lib)} · {formatTime(i.durationMs ?? lib.durations[i.id])}
                </T>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={[styles.listHead, { borderColor: s.ink }]}>
            {items.map((i, n) => (
              <View key={i.id}>
                {n > 0 && <Seam />}
                <Row item={i} onPress={() => play(i, items)} onMenu={() => onMenu(i)} />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function progressOf(lib: ReturnType<typeof useLibrary>, i: MediaItem): number {
  const p = lib.progress[i.id];
  return p && p.durationMs > 0 ? p.positionMs / p.durationMs : 0;
}

function Row({ item, onPress, onMenu }: { item: MediaItem; onPress: () => void; onMenu: () => void }) {
  const s = useScheme();
  const lib = useLibrary();
  const p = lib.progress[item.id];
  const dur = item.durationMs ?? lib.durations[item.id];
  const folder = lib.folders.find((f) => f.id === item.folderId)?.name ?? (item.kind === "bundled" ? "built in" : "opened file");
  const left = p ? Math.max(0, p.durationMs - p.positionMs) : null;
  const sub = left != null && left > 0 && p!.positionMs > 10_000 ? `${Math.max(1, Math.round(left / 60_000))} min left` : folder;
  const meta = [dur ? formatTime(dur) : null, pictureLabel(lib.facts[item.id]), item.sizeBytes ? formatBytes(item.sizeBytes) : null].filter(Boolean).join("  ·  ");
  return (
    <View style={styles.rowWrap}>
    <Pressable
      onPress={() => { tick(); onPress(); }}
      onLongPress={() => { tick("medium"); onMenu(); }}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${catalogNumber(item.id, lib)}, ${sub}. ${meta}${lib.missing[item.id] ? ". Missing" : ""}`}
      accessibilityHint="Long press for more"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: s.press }]}
    >
      <Poster item={item} width={96} progress={progressOf(lib, item)} missing={!!lib.missing[item.id]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" numberOfLines={1} style={{ fontFamily: font.spine, fontSize: 16, lineHeight: 19 }}>
          {item.title}
        </T>
        <View style={{ flexDirection: "row", gap: space.s, alignItems: "baseline" }}>
          <T v="engrave" tone="ink3" style={{ fontSize: 9.5 }}>
            {catalogNumber(item.id, lib)}
          </T>
          <T v="caption" tone="ink3" numberOfLines={1} style={{ flex: 1 }}>
            {sub}
          </T>
        </View>
        <T v="caption" tone="ink2" numberOfLines={1}>
          {meta || "—"}
        </T>
      </View>
    </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} onPress={() => { tick(); onMenu(); }} style={styles.more} hitSlop={4}>
        <MoreIcon color={s.ink2} size={22} />
      </Pressable>
    </View>
  );
}

function Chip({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  const s = useScheme();
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${label}, ${count} titles`} onPress={() => { tick(); onPress(); }} style={[styles.chip, { borderColor: on ? s.seamStrong : s.seam, backgroundColor: on ? s.paperRaised : "transparent" }]}>
      {on && <View style={[styles.dot, { backgroundColor: s.ember }]} />}
      <T v="label" numberOfLines={1} style={{ fontFamily: on ? font.semibold : font.medium, maxWidth: 180 }}>
        {label}
      </T>
      <T v="caption" tone="ink3">
        {count}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth * 2 },
  addChip: { width: 44, justifyContent: "center", paddingHorizontal: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: space.m, marginTop: space.xl, marginBottom: space.m },
  scopeActions: { flexDirection: "row", gap: space.s, marginBottom: space.m, flexWrap: "wrap" },
  search: { flexDirection: "row", alignItems: "center", gap: space.s, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: space.m, minHeight: TOUCH },
  tools: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.m, marginBottom: space.m, flexWrap: "wrap" },
  seg: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.m, padding: 3, gap: 2 },
  segItem: { minHeight: 38, paddingHorizontal: space.m, alignItems: "center", justifyContent: "center", borderRadius: radius.s },
  segIcon: { width: 40, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.s },
  pill: { minHeight: 44, paddingHorizontal: space.m, alignItems: "center", justifyContent: "center", borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth * 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.l, marginTop: space.s },
  listHead: { borderTopWidth: 1.5 },
  rowWrap: { flexDirection: "row", alignItems: "center" },
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.m },
  more: { width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" },
});

import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Action, Fact, Sheet, SheetLabel, useSheetTone } from "@/components/Sheet";
import { textStyles } from "@/components/ui";
import { addToPlaylist, catalogNumber, getLibrary, pictureLabel, removeItem, resetProgress, savePlaylist, setQueue, TEST_CARD, useLibrary, type MediaItem } from "@/core/library";
import * as Q from "@/core/queue";
import { formatBytes, formatTime } from "@/core/time";
import { radius, space, TOUCH } from "@/design/tokens";

/**
 * The item menu (desktop: the "…" on a library row). Long-press or the
 * More button opens it. Nothing here touches the file on disk.
 */
export function ItemMenu({ item, onClose, onPlay }: { item: MediaItem | null; onClose: () => void; onPlay: (item: MediaItem) => void }) {
  const lib = useLibrary();
  const [mode, setMode] = useState<"menu" | "playlist">("menu");
  const [name, setName] = useState("");
  const close = () => {
    setMode("menu");
    setName("");
    onClose();
  };
  if (!item) return <Sheet visible={false} title="" onClose={close} tone="paper">{null}</Sheet>;
  const progress = lib.progress[item.id];
  const folder = lib.folders.find((f) => f.id === item.folderId);
  const facts = lib.facts[item.id];

  return (
    <Sheet visible title={item.title} onClose={close} tone="paper">
      {mode === "menu" ? (
        <>
          <Action label={progress ? `Resume from ${formatTime(progress.positionMs)}` : "Play"} onPress={() => { close(); onPlay(item); }} />
          <Action label="Play next" onPress={() => { setQueue(Q.playNext(getLibrary().queue, item.id)); close(); }} />
          <Action label="Add to queue" onPress={() => { setQueue(Q.append(getLibrary().queue, [item.id])); close(); }} />
          <Action label="Add to playlist…" chevron onPress={() => setMode("playlist")} />
          <Action label="Start over next time" disabled={!progress} reason="No saved position" onPress={() => { resetProgress(item.id); close(); }} />
          {item.id !== TEST_CARD.id && <Action label="Remove from library" danger onPress={() => { removeItem(item.id); close(); }} />}
          <SheetLabel>Details</SheetLabel>
          <Fact k="Number" v={catalogNumber(item.id, lib)} />
          <Fact k="Length" v={formatTime(item.durationMs ?? lib.durations[item.id])} muted={!item.durationMs && !lib.durations[item.id]} />
          <Fact k="Picture" v={pictureLabel(facts) ?? "Known after first play"} muted={!facts?.height} />
          <Fact k="Size" v={formatBytes(item.sizeBytes)} />
          <Fact k="Format" v={item.format ?? "—"} />
          <Fact k="Folder" v={folder?.name ?? (item.kind === "bundled" ? "Built in" : "Opened file")} />
          <Fact k="Added" v={item.addedAt > 0 ? new Date(item.addedAt).toLocaleDateString() : "—"} />
        </>
      ) : (
        <PlaylistPicker
          name={name}
          setName={setName}
          onPick={(id) => { addToPlaylist(id, item.id); close(); }}
          onCreate={() => { savePlaylist(name || "New playlist", [item.id]); close(); }}
          onBack={() => setMode("menu")}
        />
      )}
    </Sheet>
  );
}

function PlaylistPicker({ name, setName, onPick, onCreate, onBack }: { name: string; setName: (s: string) => void; onPick: (id: string) => void; onCreate: () => void; onBack: () => void }) {
  const lib = useLibrary();
  const t = useSheetTone();
  return (
    <>
      <Action label="Back" onPress={onBack} />
      <SheetLabel>New playlist</SheetLabel>
      <View style={styles.newRow}>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={t.ink3} accessibilityLabel="New playlist name" style={[textStyles.body, styles.input, { color: t.ink, borderColor: t.seam }]} returnKeyType="done" onSubmitEditing={onCreate} />
        <Text accessibilityRole="button" onPress={onCreate} style={[textStyles.label, styles.create, { color: t.ember }]}>
          Create
        </Text>
      </View>
      {lib.playlists.length > 0 && <SheetLabel>Your playlists</SheetLabel>}
      {lib.playlists.map((p) => (
        <Action key={p.id} label={p.name} value={`${p.ids.length}`} onPress={() => onPick(p.id)} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  newRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.xl },
  input: { flex: 1, minHeight: TOUCH, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.m, paddingHorizontal: space.m },
  create: { minHeight: TOUCH, textAlignVertical: "center", paddingTop: 14, fontWeight: "600" },
});

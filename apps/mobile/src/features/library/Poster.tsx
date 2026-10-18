import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { textStyles } from "@/components/ui";
import type { MediaItem } from "@/core/library";
import { usePoster } from "@/core/media";
import { useScheme } from "@/design/theme";
import { font, radius, room } from "@/design/tokens";

/**
 * A title's poster: a decoded frame, as on desktop. Until one exists (or for
 * audio) the spine stands in: ink tile, condensed title, no invented art.
 * `progress` draws the ember line along the bottom edge; `onAir` the tally.
 */
export function Poster({ item, width, progress, onAir, missing }: { item: MediaItem; width: number; progress?: number; onAir?: boolean; missing?: boolean }) {
  const s = useScheme();
  const uri = usePoster(item);
  const height = Math.round((width * 9) / 16);
  return (
    <View style={[styles.box, { width, height, backgroundColor: s.thumb }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.spine]}>
          <Text numberOfLines={2} style={{ fontFamily: font.spine, fontSize: Math.max(11, width / 11), lineHeight: Math.max(12, width / 10), color: room.cream, textTransform: "uppercase" }}>
            {item.title}
          </Text>
          <View style={styles.beam} />
        </View>
      )}
      {missing && (
        <View style={[StyleSheet.absoluteFill, styles.missing]}>
          <Text style={[textStyles.engrave, { color: room.cream, fontSize: 10 }]}>Missing</Text>
        </View>
      )}
      {onAir && (
        <View style={styles.onAir}>
          <View style={styles.lamp} />
          <Text style={[textStyles.engrave, { color: room.cream, fontSize: 9.5 }]}>On air</Text>
        </View>
      )}
      {progress != null && progress > 0.005 && (
        <View style={styles.track}>
          <View style={{ width: `${Math.min(100, progress * 100)}%`, height: "100%", backgroundColor: s.ember }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.m, overflow: "hidden" },
  spine: { backgroundColor: "#1C1C19", padding: 10, justifyContent: "flex-end" },
  beam: { position: "absolute", top: 10, right: 12, width: 5, height: 18, backgroundColor: room.ember, transform: [{ skewX: "-15.3deg" }] },
  missing: { backgroundColor: "rgba(11,11,10,0.62)", alignItems: "center", justifyContent: "center" },
  onAir: { position: "absolute", left: 6, bottom: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#171715", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },
  lamp: { width: 6, height: 6, backgroundColor: room.ember, borderRadius: 1 },
  track: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(242,239,232,0.6)" },
});

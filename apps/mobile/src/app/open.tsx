import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { addFiles, playIds } from "@/core/library";
import { useScheme } from "@/design/theme";

/** Best display name for a URI another app handed over. */
function nameOf(uri: string): string {
  try {
    const n = new File(uri).name;
    if (n) return n;
  } catch {
    /* provider cannot answer */
  }
  const last = decodeURIComponent(uri.split("/").pop() ?? "Video");
  return last.split(":").pop() || "Video";
}

/**
 * Target of "Open with NOVA": adds the file like "Open file" and plays it,
 * with Home underneath so Back lands in the library.
 */
export default function Open() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const router = useRouter();
  const s = useScheme();
  useEffect(() => {
    router.replace("/");
    if (!uri) return;
    let size: number | null = null;
    try {
      size = new File(uri).size ?? null;
    } catch {
      size = null;
    }
    const [item] = addFiles([{ uri, name: nameOf(uri), size }]);
    if (!item) return;
    playIds([item.id], item.id);
    router.push({ pathname: "/player", params: { id: item.id } });
  }, [uri, router]);
  return <View style={{ flex: 1, backgroundColor: s.paper }} />;
}

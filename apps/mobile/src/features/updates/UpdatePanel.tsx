import * as Linking from "expo-linking";
import { StyleSheet, View } from "react-native";
import { Button, T, Touch } from "@/components/ui";
import { formatBytes } from "@/core/time";
import { checkForUpdate, currentVersion, dismissUpdate, installUpdate, isDismissed, RELEASES_PAGE, updatesUnsupported, useUpdates, type UpdateState } from "@/core/updates";
import { useScheme } from "@/design/theme";
import { font, radius, space } from "@/design/tokens";

const progress = (st: Extract<UpdateState, { kind: "downloading" }>) =>
  st.total ? `${Math.floor((st.received / st.total) * 100)} % · ${formatBytes(st.received)} of ${formatBytes(st.total)}` : formatBytes(st.received);

/** Home notice, as desktop's update toast: shown when a newer release is ready, until "Later". */
export function UpdateBanner({ gutter }: { gutter: number }) {
  const s = useScheme();
  const st = useUpdates();
  const update = "update" in st ? st.update : null;
  if (!update || isDismissed(update.version) || st.kind === "none") return null;
  const busy = st.kind === "downloading" || st.kind === "verifying" || st.kind === "installing";
  return (
    <View style={[styles.banner, { marginHorizontal: gutter, borderColor: s.ember, backgroundColor: s.paperRaised }]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <View style={[styles.lamp, { backgroundColor: s.ember }]} />
        <T v="engrave" tone="ember">
          Update
        </T>
      </View>
      <T v="title" style={{ marginTop: 2 }}>
        NOVA {update.version} is ready
      </T>
      <T v="label" tone="ink2" style={{ marginTop: 2 }}>
        {st.kind === "downloading"
          ? `Downloading · ${progress(st)}`
          : st.kind === "verifying"
            ? "Checking the download…"
            : st.kind === "installing"
              ? "Opening Android’s installer…"
              : st.kind === "error"
                ? st.message
                : `You have ${currentVersion()}. ${formatBytes(update.apk.size)} download, signed by NOVA. Your library and settings stay.`}
      </T>
      {!busy && (
        <View style={[styles.row, { marginTop: space.m, gap: space.m }]}>
          <View style={{ flex: 1 }}>
            <Button kind="ember" label={st.kind === "error" ? "Try again" : "Install"} onPress={() => void installUpdate()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Later" onPress={() => dismissUpdate(update.version)} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Settings › Updates: version, auto-check, check now, install. */
export function UpdateStatus() {
  const st = useUpdates();
  const s = useScheme();
  const unsupported = updatesUnsupported();
  if (unsupported) {
    return (
      <T v="label" tone="ink2">
        {unsupported}
      </T>
    );
  }
  const line =
    st.kind === "checking"
      ? "Checking GitHub…"
      : st.kind === "none"
        ? `You have the newest version (${currentVersion()}).`
        : st.kind === "available"
          ? `NOVA ${st.update.version} is available.`
          : st.kind === "downloading"
            ? `Downloading ${st.update.version} · ${progress(st)}`
            : st.kind === "verifying"
              ? "Checking the download…"
              : st.kind === "installing"
                ? "Opening Android’s installer…"
                : st.kind === "error"
                  ? st.message
                  : `NOVA ${currentVersion()}.`;
  const update = "update" in st ? st.update : null;
  return (
    <View style={{ gap: space.m }}>
      <T v="label" tone={st.kind === "error" ? "danger" : "ink2"}>
        {line}
      </T>
      {update?.notes && (st.kind === "available" || st.kind === "error") && (
        <T v="caption" tone="ink3" numberOfLines={8}>
          {update.notes}
        </T>
      )}
      <View style={[styles.row, { gap: space.m }]}>
        {update && (st.kind === "available" || st.kind === "error") ? (
          <View style={{ flex: 1 }}>
            <Button kind="ember" label={`Install ${update.version}`} onPress={() => void installUpdate()} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Button label="Check now" onPress={() => void checkForUpdate()} />
          </View>
        )}
        <Touch accessibilityRole="link" onPress={() => void Linking.openURL(update?.page ?? RELEASES_PAGE)} style={{ paddingHorizontal: space.s }}>
          <T v="label" style={{ color: s.emberText, fontFamily: font.semibold }}>
            Release notes
          </T>
        </Touch>
      </View>
      <T v="caption" tone="ink3">
        Downloads come from NOVA’s GitHub releases and are checked against the release’s SHA-256. Android installs them only if they carry the same signature as this app. The first time, Android asks you to allow installs from NOVA.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: space.m, padding: space.l, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth * 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s },
  lamp: { width: 8, height: 8, borderRadius: 1 },
});

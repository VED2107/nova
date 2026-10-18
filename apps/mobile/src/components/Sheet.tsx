import { createContext, useContext, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScheme } from "@/design/theme";
import { font, radius, room, space, TOUCH } from "@/design/tokens";
import { CheckIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { textStyles, tick } from "./ui";

/** Sheet colours: Darkroom over the picture, paper over the library (as on desktop). */
interface Tone {
  bg: string;
  ink: string;
  ink2: string;
  ink3: string;
  seam: string;
  press: string;
  ember: string;
}
const ToneContext = createContext<Tone>({ bg: room.ply2, ink: room.ink, ink2: room.ink2, ink3: room.ink3, seam: room.seam, press: "rgba(242,239,232,0.08)", ember: room.ember });
export const useSheetTone = () => useContext(ToneContext);

/**
 * A sheet: bottom sheet in portrait; in landscape it docks to the right
 * edge so the picture stays visible, like the desktop side panel.
 */
export function Sheet({ visible, title, onClose, children, tone = "room" }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; tone?: "room" | "paper" }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = useScheme();
  const landscape = width > height;
  const t: Tone =
    tone === "room"
      ? { bg: room.ply2, ink: room.ink, ink2: room.ink2, ink3: room.ink3, seam: room.seam, press: "rgba(242,239,232,0.08)", ember: room.ember }
      : { bg: s.paperRaised, ink: s.ink, ink2: s.ink2, ink3: s.ink3, seam: s.seamStrong, press: s.press, ember: s.ember };
  return (
    <Modal visible={visible} transparent animationType={landscape ? "fade" : "slide"} onRequestClose={onClose} supportedOrientations={["portrait", "landscape-left", "landscape-right"]}>
      <Pressable accessibilityLabel="Close" style={styles.scrim} onPress={onClose} />
      <View
        style={[
          styles.panel,
          { backgroundColor: t.bg, borderColor: t.seam },
          landscape
            ? { right: 0, top: 0, bottom: 0, width: Math.min(420, width * 0.48), paddingTop: insets.top + space.s, paddingRight: insets.right, borderLeftWidth: StyleSheet.hairlineWidth }
            : { left: 0, right: 0, bottom: 0, maxHeight: height * 0.8, paddingBottom: insets.bottom + space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l },
        ]}
        accessibilityViewIsModal
      >
        <ToneContext.Provider value={t}>
          {!landscape && <View style={[styles.grip, { backgroundColor: t.seam }]} />}
          <View style={styles.head}>
            <Text accessibilityRole="header" numberOfLines={1} style={[textStyles.title, { color: t.ink, flex: 1, fontFamily: font.spine, fontSize: 22 }]}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close} hitSlop={8}>
              <CloseIcon color={t.ink2} size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: space.l }} bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </ToneContext.Provider>
      </View>
    </Modal>
  );
}

export function SheetLabel({ children }: { children: string }) {
  const t = useSheetTone();
  return <Text style={[textStyles.engrave, styles.label, { color: t.ink3 }]}>{children}</Text>;
}

/** A selectable row. The selection mark is the ember beam plus a check, never colour alone. */
export function Choice({ label, detail, selected, onPress, disabled }: { label: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const t = useSheetTone();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, pressed && { backgroundColor: t.press }, disabled && { opacity: 0.45 }]}
    >
      <View style={[styles.mark, selected && { backgroundColor: t.ember }]} />
      <View style={{ flex: 1 }}>
        <Text style={[textStyles.body, { color: t.ink, fontFamily: selected ? font.semibold : font.regular }]}>{label}</Text>
        {detail ? <Text style={[textStyles.caption, { color: t.ink3 }]}>{detail}</Text> : null}
      </View>
      {selected && <CheckIcon color={t.ember} size={20} />}
    </Pressable>
  );
}

/** An action row (menus). `value` shows the current state on the right, as in the desktop menu. */
export function Action({ label, value, onPress, disabled, reason, danger, icon, chevron }: { label: string; value?: string; onPress: () => void; disabled?: boolean; reason?: string; danger?: boolean; icon?: ReactNode; chevron?: boolean }) {
  const t = useSheetTone();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ""}${disabled && reason ? `. ${reason}` : ""}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, pressed && { backgroundColor: t.press }]}
    >
      {icon ? <View style={{ width: 24, alignItems: "center", opacity: disabled ? 0.4 : 1 }}>{icon}</View> : null}
      <View style={{ flex: 1, opacity: disabled ? 0.45 : 1 }}>
        <Text style={[textStyles.body, { color: danger ? "#FF8A7A" : t.ink }]}>{label}</Text>
        {disabled && reason ? <Text style={[textStyles.caption, { color: t.ink3 }]}>{reason}</Text> : null}
      </View>
      {value ? <Text style={[textStyles.readout, { color: t.ink2 }]}>{value}</Text> : null}
      {chevron ? <ChevronRightIcon color={t.ink3} size={18} /> : null}
    </Pressable>
  );
}

/** A fact row for the playback information sheet. */
export function Fact({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  const t = useSheetTone();
  return (
    <View style={[styles.fact, { borderColor: t.seam }]}>
      <Text style={[textStyles.label, { color: t.ink3, flexShrink: 0, width: 120 }]}>{k}</Text>
      <Text selectable style={[textStyles.label, { color: muted ? t.ink3 : t.ink, flex: 1, textAlign: "right" }]}>
        {v}
      </Text>
    </View>
  );
}

export function SheetNote({ children }: { children: string }) {
  const t = useSheetTone();
  return <Text style={[textStyles.label, { color: t.ink3, paddingHorizontal: space.xl, paddingVertical: space.s }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  panel: { position: "absolute" },
  grip: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginTop: space.s },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: space.xl, paddingRight: space.s, minHeight: TOUCH + 8 },
  close: { width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" },
  label: { paddingHorizontal: space.xl, paddingTop: space.l, paddingBottom: space.xs },
  choice: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: TOUCH + 4, paddingHorizontal: space.xl, paddingVertical: space.s },
  mark: { width: 4, height: 18, borderRadius: 1, transform: [{ skewX: "-15.3deg" }], backgroundColor: "transparent" },
  fact: { flexDirection: "row", gap: space.m, paddingHorizontal: space.xl, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});

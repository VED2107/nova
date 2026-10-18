import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { getPrefs } from "@/core/prefs";
import { useScheme } from "@/design/theme";
import { font, radius, space, TOUCH, type } from "@/design/tokens";

/** Light selection tick, only where it confirms a physical action (seek landed, toggle). */
export function tick(kind: "select" | "light" | "medium" = "select") {
  if (getPrefs().haptics !== "on" || Platform.OS === "web") return;
  if (kind === "select") void Haptics.selectionAsync().catch(() => {});
  else void Haptics.impactAsync(kind === "light" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

type Variant = keyof typeof variants;
const variants = {
  display: { fontFamily: font.spine, fontSize: type.display, lineHeight: type.display * 1.02, letterSpacing: -0.4 },
  heading: { fontFamily: font.bold, fontSize: type.heading, lineHeight: type.heading * 1.15, letterSpacing: -0.2 },
  title: { fontFamily: font.semibold, fontSize: type.title, lineHeight: type.title * 1.25 },
  body: { fontFamily: font.regular, fontSize: type.body, lineHeight: type.body * 1.45 },
  label: { fontFamily: font.medium, fontSize: type.label, lineHeight: type.label * 1.3 },
  caption: { fontFamily: font.regular, fontSize: type.caption, lineHeight: type.caption * 1.35 },
  /** Small caps engraving for section labels: tracked, uppercase. */
  engrave: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: "uppercase" as const },
  /** Tabular readout for times. */
  readout: { fontFamily: font.medium, fontSize: type.label, fontVariant: ["tabular-nums" as const] },
} satisfies Record<string, TextStyle>;

export function T({ v = "body", tone = "ink", style, ...rest }: TextProps & { v?: Variant; tone?: "ink" | "ink2" | "ink3" | "ember" | "danger"; style?: StyleProp<TextStyle> }) {
  const s = useScheme();
  const color = { ink: s.ink, ink2: s.ink2, ink3: s.ink3, ember: s.emberText, danger: s.danger }[tone];
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[variants[v], { color }, style]} />;
}

export const textStyles = variants;

/** Press feedback is a quiet ink wash, not a ripple or a scale bounce. */
export function Touch({ style, children, haptic, onPress, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode; haptic?: boolean }) {
  const s = useScheme();
  return (
    <Pressable
      hitSlop={6}
      android_ripple={undefined}
      {...rest}
      onPress={(e) => {
        if (haptic) tick();
        onPress?.(e);
      }}
      style={({ pressed }) => [{ minHeight: TOUCH, justifyContent: "center" }, style, pressed && { backgroundColor: s.press }]}
    >
      {children}
    </Pressable>
  );
}

export function Button({ label, icon, onPress, kind = "plain", accessibilityHint }: { label: string; icon?: ReactNode; onPress: () => void; kind?: "plain" | "ember"; accessibilityHint?: string }) {
  const s = useScheme();
  const ember = kind === "ember";
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      haptic
      style={[
        styles.button,
        ember ? { backgroundColor: s.ember } : { borderColor: s.seamStrong, borderWidth: StyleSheet.hairlineWidth * 2 },
      ]}
    >
      <View style={styles.buttonRow}>
        {icon}
        <T v="label" style={{ color: ember ? s.onEmber : s.ink, fontFamily: font.semibold }}>
          {label}
        </T>
      </View>
    </Touch>
  );
}

export function Seam({ inset = 0 }: { inset?: number }) {
  const s = useScheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: s.seam, marginLeft: inset }} />;
}

/** A small rectangular tag (codec, "Demo", "Needs NOVA engine"). */
export function Tag({ children, tone = "plain" }: { children: string; tone?: "plain" | "ember" | "warn" }) {
  const s = useScheme();
  const color = tone === "ember" ? s.emberText : tone === "warn" ? s.danger : s.ink2;
  return (
    <View style={[styles.tag, { borderColor: tone === "plain" ? s.seamStrong : color }]}>
      <Text style={[variants.engrave, { color, fontSize: 10, letterSpacing: 0.8 }]}>{children}</Text>
    </View>
  );
}

/** Segmented choice (settings). Each segment is a full 48 pt target. */
export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  const s = useScheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { borderColor: s.seamStrong, backgroundColor: s.paperSunk }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              tick();
              onChange(o.value);
            }}
            style={[styles.segment, on && { backgroundColor: s.paperRaised, borderColor: s.seamStrong }]}
          >
            <T v="label" style={{ fontFamily: on ? font.semibold : font.medium, color: on ? s.ink : s.ink2 }}>
              {o.label}
            </T>
            {on && <View style={[styles.segmentBeam, { backgroundColor: s.ember }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.m, paddingHorizontal: space.l },
  buttonRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s },
  tag: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" },
  segmented: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.m, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: TOUCH - 6, alignItems: "center", justifyContent: "center", borderRadius: radius.s, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: "transparent" },
  segmentBeam: { position: "absolute", bottom: 5, width: 12, height: 2, borderRadius: 1, transform: [{ skewX: "-15.3deg" }] },
});

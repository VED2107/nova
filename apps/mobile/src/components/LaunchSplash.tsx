import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

/** Same colour and symbol size as the native splash (app.json), so the hand-off is seamless. */
const BG = "#171715";
const CREAM = "#F7F4EE";
const EMBER = "#F97316";
const SIZE = 120;

/**
 * The starting logo, after the system splash. The symbol stays exactly
 * where the system splash drew it (no jump at the hand-off);  an ember rule
 * runs under it like a timeline being scrubbed, then the curtain lifts.
 * (No wordmark: its N is the symbol, so the two are never paired.) About a second; reduced motion gets a
 * plain fade.
 */
export function LaunchSplash({ onDone }: { onDone: () => void }) {
  const [reduce, setReduce] = useState<boolean | null>(null);
  const stroke = useSharedValue(0);
  const word = useSharedValue(0);
  const curtain = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => setReduce(false));
  }, []);

  useEffect(() => {
    if (reduce == null) return;
    const finish = () => {
      "worklet";
      runOnJS(onDone)();
    };
    if (reduce) {
      stroke.value = 1;
      word.value = 1;
      curtain.value = withDelay(350, withTiming(0, { duration: 250 }, finish));
      return;
    }
    word.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    stroke.value = withDelay(220, withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }));
    curtain.value = withDelay(1050, withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }, finish));
  }, [reduce, onDone, stroke, word, curtain]);

  const ruleStyle = useAnimatedStyle(() => ({ width: `${stroke.value * 100}%` }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 10 }] }));
  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, curtainStyle]} accessibilityLabel="NOVA is starting">
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 256 256">
          <Path d="M40 40h32v176h-32zM184 40h32v176h-32z" fill={CREAM} />
          <Path d="M82 40h44L174 216h-44z" fill={EMBER} />
        </Svg>
      </View>
      <Animated.View style={[styles.word, wordStyle]}>
        <View style={styles.track}>
          <Animated.View style={[styles.rule, ruleStyle]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BG, alignItems: "center", justifyContent: "center", zIndex: 100 },
  word: { position: "absolute", top: "50%", marginTop: SIZE / 2 + 18, width: SIZE * 0.72 },
  track: { height: 2, backgroundColor: "rgba(247,244,238,0.14)", borderRadius: 1, overflow: "hidden" },
  rule: { height: 2, backgroundColor: EMBER },
});

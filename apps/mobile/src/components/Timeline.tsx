import { useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { msToFraction, pointerToMs, scrubbedMs, scrubRate } from "@/core/seek";
import { formatTime } from "@/core/time";
import { BEAM_SKEW_DEG, room, TOUCH } from "@/design/tokens";
import { tick } from "./ui";

export interface ScrubState {
  ms: number;
  rate: number;
  /** Where the finger is along the track (0..1), for placing the preview. */
  fraction: number;
}

/**
 * The NOVA timeline for touch. A 48 pt tall target around a slim track:
 * - Touch down anywhere: the playhead jumps under the finger (absolute).
 * - Drag: horizontal movement scrubs; sliding the finger up away from the bar
 *   slows the scrub (1/2, 1/4, 1/8) for precise landing on long media. The
 *   rate re-anchors where it changes, so the playhead never jumps.
 * - Release: the parent performs one accurate seek to the shown time.
 * The playhead is the Lumen beam (15.3°), as on desktop.
 */
export function Timeline(props: {
  positionMs: number;
  durationMs: number | null;
  /** Time held by the parent while scrubbing or until the final seek lands. */
  heldMs: number | null;
  disabled?: boolean;
  stepMs: number;
  /** A–B loop drawn as on desktop: a bracket around the span, A alone a single stem. */
  abLoop?: { aMs: number | null; bMs: number | null };
  onScrubStart: (s: ScrubState) => void;
  onScrub: (s: ScrubState) => void;
  onScrubEnd: (s: ScrubState) => void;
  onStep: (offsetMs: number) => void;
}) {
  const { durationMs, heldMs } = props;
  const max = durationMs ?? 0;
  const live = !props.disabled && max > 0;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const anchor = useRef({ ms: 0, x: 0, rate: 1 });
  const last = useRef<ScrubState>({ ms: 0, rate: 1, fraction: 0 });

  const value = heldMs ?? Math.min(props.positionMs, max);
  const f = msToFraction(value, max);

  const at = (x: number, dy: number): ScrubState => {
    const rate = scrubRate(dy);
    const a = anchor.current;
    if (rate !== a.rate) {
      // Re-anchor at the current time so a rate change never jumps the playhead.
      anchor.current = { ms: last.current.ms, x, rate };
      if (rate < a.rate) tick("light");
    }
    const ms = scrubbedMs(anchor.current.ms, x - anchor.current.x, width, max, anchor.current.rate);
    const s = { ms, rate, fraction: Math.min(1, Math.max(0, x / Math.max(1, width))) };
    last.current = s;
    return s;
  };

  const pan = Gesture.Pan()
    .enabled(live && width > 0)
    .runOnJS(true)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      const ms = pointerToMs(e.x, 0, width, max);
      anchor.current = { ms, x: e.x, rate: 1 };
      last.current = { ms, rate: 1, fraction: e.x / Math.max(1, width) };
      setActive(true);
      tick("light");
      props.onScrubStart(last.current);
    })
    .onUpdate((e) => props.onScrub(at(e.x, e.translationY)))
    .onFinalize(() => {
      setActive(false);
      props.onScrubEnd(last.current);
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={styles.hit}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityHint={`Swipe up or down to move ${props.stepMs / 1000} seconds`}
        accessibilityValue={{ text: `${formatTime(value)} of ${formatTime(durationMs)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => props.onStep(e.nativeEvent.actionName === "increment" ? props.stepMs : -props.stepMs)}
      >
        <View style={[styles.track, active && styles.trackActive, !live && styles.trackDead]}>
          <View style={[styles.played, { width: `${f * 100}%` }]} />
        </View>
        {live && props.abLoop?.aMs != null && (
          <View
            pointerEvents="none"
            style={
              props.abLoop.bMs != null
                ? [styles.ab, { left: msToFraction(props.abLoop.aMs, max) * width, width: Math.max(2, (msToFraction(props.abLoop.bMs, max) - msToFraction(props.abLoop.aMs, max)) * width) }]
                : [styles.abStem, { left: msToFraction(props.abLoop.aMs, max) * width - 1 }]
            }
          />
        )}
        {live && <View pointerEvents="none" style={[styles.beam, active && styles.beamActive, { left: f * width - (active ? 4 : 3) }]} />}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: TOUCH, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: room.track, overflow: "hidden" },
  trackActive: { height: 8, borderRadius: 2 },
  trackDead: { backgroundColor: "rgba(242,239,232,0.08)" },
  played: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: room.ember },
  beam: {
    position: "absolute",
    top: TOUCH / 2 - 9,
    width: 6,
    height: 18,
    borderRadius: 1,
    backgroundColor: room.ember,
    borderWidth: 1.5,
    borderColor: "rgba(11,11,10,0.7)",
    transform: [{ skewX: `${BEAM_SKEW_DEG}deg` }],
  },
  ab: { position: "absolute", top: TOUCH / 2 - 8, height: 16, borderLeftWidth: 2, borderRightWidth: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(247,244,238,0.9)" },
  abStem: { position: "absolute", top: TOUCH / 2 - 8, height: 16, width: 2, backgroundColor: room.cream },
  beamActive: { top: TOUCH / 2 - 14, width: 8, height: 28 },
});

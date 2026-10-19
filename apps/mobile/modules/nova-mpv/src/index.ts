import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { Ref } from "react";
import type { ViewProps } from "react-native";

/** Present in NOVA's Android builds; absent in Expo Go and on iOS. */
export const mpvAvailable = requireOptionalNativeModule("NovaMpv") != null;

export interface MpvTrack {
  id: number;
  type: "video" | "audio" | "sub";
  title: string | null;
  lang: string | null;
  codec: string | null;
  external: boolean;
  selected: boolean;
}

/** Batched property changes; keys are mpv property names plus `tracks`. */
export type MpvState = Record<string, unknown>;

export interface MpvViewHandle {
  command(args: string[]): Promise<void>;
  setProperty(name: string, value: string): Promise<void>;
  /** Writes a PNG of the shown picture to `path`; resolves with its file:// URI. */
  screenshot(path: string): Promise<string>;
}

export interface MpvViewProps extends ViewProps {
  ref?: Ref<MpvViewHandle>;
  source: { uri: string; startMs: number | null };
  onState: (e: { nativeEvent: MpvState }) => void;
  onEngineEvent: (e: { nativeEvent: { name: "loaded" | "restart" | "seek" | "end" | "failed" } }) => void;
}

export const MpvView = mpvAvailable ? requireNativeView<MpvViewProps>("NovaMpv") : null;

import type { ReactNode } from "react";
import { Platform } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Hidden from screen readers; the button around an icon carries the label. (Web has no such props.) */
const decorative = Platform.OS === "web" ? {} : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };

/* The desktop icon family (apps/desktop/src/components/icons.tsx), same
   paths: 20-unit grid, 1.6 stroke, round caps and joins, filled only where a
   glyph is a solid object. Scaled up for touch, never redrawn. */
type P = { size?: number; color: string };
function I({ size = 24, color, children }: P & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...decorative}>
      {children}
    </Svg>
  );
}
const solid = (color: string) => ({ fill: color, stroke: "none" });

export const PlayIcon = (p: P) => <I {...p}><Path d="M6 3.8v12.4l10-6.2z" {...solid(p.color)} /></I>;
export const PauseIcon = (p: P) => <I {...p}><Rect x="5" y="4" width="3.4" height="12" rx="0.8" {...solid(p.color)} /><Rect x="11.6" y="4" width="3.4" height="12" rx="0.8" {...solid(p.color)} /></I>;
export const NextIcon = (p: P) => <I {...p}><Path d="M4.5 4.5v11l8-5.5z" {...solid(p.color)} /><Path d="M15.5 4.5v11" strokeWidth={2} /></I>;
export const PreviousIcon = (p: P) => <I {...p}><Path d="M15.5 4.5v11l-8-5.5z" {...solid(p.color)} /><Path d="M4.5 4.5v11" strokeWidth={2} /></I>;
export const SubtitlesIcon = (p: P) => <I {...p}><Rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2" /><Path d="M6 10.6h3M11 10.6h3M6 13h5" /></I>;
export const SettingsIcon = (p: P) => <I {...p}><Path d="M3.5 6h8M15 6h1.5M3.5 14h1.5M8.5 14h8" /><Circle cx="13.2" cy="6" r="1.8" /><Circle cx="6.8" cy="14" r="1.8" /></I>;
export const InfoIcon = (p: P) => <I {...p}><Circle cx="10" cy="10" r="7" /><Path d="M10 9v4.6M10 6.4v.1" /></I>;
export const QueueIcon = (p: P) => <I {...p}><Path d="M3.5 5.5h9M3.5 10h9M3.5 14.5h5.5" /><Path d="M13 12.2v5l4-2.5z" {...solid(p.color)} /></I>;
export const LoopIcon = (p: P) => <I {...p}><Path d="M14 3.2 16.5 5.7 14 8.2" /><Path d="M3.5 10V9a3.3 3.3 0 0 1 3.3-3.3h9.7" /><Path d="M6 16.8 3.5 14.3 6 11.8" /><Path d="M16.5 10v1a3.3 3.3 0 0 1-3.3 3.3H3.5" /></I>;
export const CloseIcon = (p: P) => <I {...p}><Path d="m5.5 5.5 9 9m0-9-9 9" /></I>;
export const ChevronDownIcon = (p: P) => <I {...p}><Path d="m4.5 8 5.5 5.5L15.5 8" /></I>;
export const ChevronRightIcon = (p: P) => <I {...p}><Path d="m8 4.5 5.5 5.5L8 15.5" /></I>;
export const CheckIcon = (p: P) => <I {...p}><Path d="m4.2 10.4 3.7 3.7 7.9-8.2" /></I>;
export const SearchIcon = (p: P) => <I {...p}><Circle cx="8.8" cy="8.8" r="5.3" /><Path d="m12.8 12.8 3.7 3.7" /></I>;
export const FolderIcon = (p: P) => <I {...p}><Path d="M2.8 6.2a1.6 1.6 0 0 1 1.6-1.6h3.4l1.7 1.8h6.1a1.6 1.6 0 0 1 1.6 1.6v6.6a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" /></I>;
export const FileIcon = (p: P) => <I {...p}><Path d="M5.2 2.8h6.3l3.3 3.3v11.1H5.2z" /><Path d="M11.3 2.8v3.5h3.5" /></I>;
export const ReplayIcon = (p: P) => <I {...p}><Path d="M4.3 10a5.7 5.7 0 1 0 1.8-4.2" /><Path d="M4 3.6v3.6h3.6" /></I>;
export const MoreIcon = (p: P) => <I {...p}><Circle cx="4.6" cy="10" r="1.25" {...solid(p.color)} /><Circle cx="10" cy="10" r="1.25" {...solid(p.color)} /><Circle cx="15.4" cy="10" r="1.25" {...solid(p.color)} /></I>;
export const TrashIcon = (p: P) => <I {...p}><Path d="M4 5.8h12M8 5.8V4h4v1.8M5.6 5.8l.7 10.4h7.4l.7-10.4" /></I>;
export const PlusIcon = (p: P) => <I {...p}><Path d="M10 4v12M4 10h12" /></I>;
export const GridIcon = (p: P) => <I {...p}><Rect x="3.5" y="4" width="5.5" height="5" rx="1" /><Rect x="11" y="4" width="5.5" height="5" rx="1" /><Rect x="3.5" y="11" width="5.5" height="5" rx="1" /><Rect x="11" y="11" width="5.5" height="5" rx="1" /></I>;
export const ListIcon = (p: P) => <I {...p}><Path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" /><Path d="M3.6 5.5h.8M3.6 10h.8M3.6 14.5h.8" strokeWidth={2} /></I>;
export const StopIcon = (p: P) => <I {...p}><Rect x="5" y="5" width="10" height="10" rx="1.2" {...solid(p.color)} /></I>;
export const VolumeIcon = (p: P) => <I {...p}><Path d="M3.5 7.8h2.8L10 4.5v11l-3.7-3.3H3.5z" /><Path d="M13 7.6a3.3 3.3 0 0 1 0 4.8" /><Path d="M15.2 5.4a6.3 6.3 0 0 1 0 9.2" /></I>;
export const MuteIcon = (p: P) => <I {...p}><Path d="M3.5 7.8h2.8L10 4.5v11l-3.7-3.3H3.5z" /><Path d="m13 8 4 4m0-4-4 4" /></I>;
export const FullscreenIcon = (p: P) => <I {...p}><Path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" /></I>;
export const ShuffleIcon = (p: P) => <I {...p}><Path d="M3.5 6h2.6c1.4 0 2.6.8 3.2 2l1.4 3c.6 1.2 1.8 2 3.2 2h2.6" /><Path d="M3.5 14h2.6c.9 0 1.7-.3 2.3-.9M12.1 6.9c.6-.6 1.4-.9 2.3-.9h2.1" /><Path d="m14.8 4 2 2-2 2M14.8 11l2 2-2 2" /></I>;
export const BrightnessIcon = (p: P) => <I {...p}><Circle cx="10" cy="10" r="3.2" /><Path d="M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M4.9 4.9l1.1 1.1M14 14l1.1 1.1M4.9 15.1 6 14M14 6l1.1-1.1" /></I>;
/* Mobile additions, drawn on the same grid and stroke. */
export const LockIcon = (p: P) => <I {...p}><Rect x="4.5" y="9" width="11" height="8" rx="1.6" /><Path d="M7 9V6.6a3 3 0 0 1 6 0V9" /></I>;
export const UnlockIcon = (p: P) => <I {...p}><Rect x="4.5" y="9" width="11" height="8" rx="1.6" /><Path d="M7 9V6.6a3 3 0 0 1 5.8-1.1" /></I>;
export const RotateIcon = (p: P) => <I {...p}><Rect x="6" y="2.8" width="8" height="14.4" rx="1.6" /><Path d="M2.6 9.2a7.4 7.4 0 0 1 2.2-4.6M17.4 10.8a7.4 7.4 0 0 1-2.2 4.6" /></I>;
export const SpeedIcon = (p: P) => <I {...p}><Path d="M3.6 14.6a7 7 0 1 1 12.8 0" /><Path d="m10 11.2 3.4-4" /><Circle cx="10" cy="11.4" r="1" {...solid(p.color)} /></I>;
export const PipIcon = (p: P) => <I {...p}><Rect x="2.8" y="4.2" width="14.4" height="11.6" rx="1.6" /><Rect x="10.2" y="9.6" width="5" height="4" rx="0.6" {...solid(p.color)} /></I>;
/** Skip arc; the caller sets the step in seconds inside it in Archivo (svg text would not use the app font). */
export function SkipIcon({ size = 30, color, forward }: P & { forward: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...decorative}>
      <Path d={forward ? "M19.4 12a7.4 7.4 0 1 1-2.2-5.2" : "M4.6 12a7.4 7.4 0 1 0 2.2-5.2"} />
      <Path d={forward ? "M17.6 2.8v4.3h-4.3" : "M6.4 2.8v4.3h4.3"} />
    </Svg>
  );
}

/** Lumen N symbol: two stems and the ember beam (brand/final/nova-symbol*.svg). */
export function Symbol({ size = 28, stem }: { size?: number; stem: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" accessibilityLabel="NOVA">
      <Path d="M40 40h32v176h-32zM184 40h32v176h-32z" fill={stem} />
      <Path d="M82 40h44L174 216h-44z" fill="#F97316" />
    </Svg>
  );
}

/** Wordmark: its N is the symbol, so never pair it with <Symbol> ("NNOVA"). */
export function Wordmark({ height = 22, ink }: { height?: number; ink: string }) {
  return (
    <Svg width={(height * 758) / 256} height={height} viewBox="0 0 758 256" accessibilityLabel="NOVA">
      <Path
        d="M0 40h32v176h-32zM144 40h32v176h-32zM216 128a88 88 0 1 0 176 0a88 88 0 1 0 -176 0zM248 128a56 56 0 1 1 112 0a56 56 0 1 1 -112 0zM422 40L456 40L504 216L552 40L586 40L538 216L470 216zM594 216L628 216L676 40L724 216L758 216L710 40L642 40z"
        fill={ink}
        fillRule="evenodd"
      />
      <Path d="M42 40h44L134 216h-44z" fill="#F97316" />
    </Svg>
  );
}

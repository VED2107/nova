import type { SVGProps } from "react";

/* One icon family: 20px grid, 1.6 stroke, round caps/joins, filled only where
   a glyph is a solid object (play, pause, transport). */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...p,
});

export const PlayIcon = (p: P) => <svg {...base(p)}><path d="M6 3.8v12.4l10-6.2z" fill="currentColor" stroke="none" /></svg>;
export const PauseIcon = (p: P) => <svg {...base(p)}><rect x="5" y="4" width="3.4" height="12" rx="0.8" fill="currentColor" stroke="none" /><rect x="11.6" y="4" width="3.4" height="12" rx="0.8" fill="currentColor" stroke="none" /></svg>;
export const NextIcon = (p: P) => <svg {...base(p)}><path d="M4.5 4.5v11l8-5.5z" fill="currentColor" stroke="none" /><path d="M15.5 4.5v11" strokeWidth={2} /></svg>;
export const PreviousIcon = (p: P) => <svg {...base(p)}><path d="M15.5 4.5v11l-8-5.5z" fill="currentColor" stroke="none" /><path d="M4.5 4.5v11" strokeWidth={2} /></svg>;
export const VolumeIcon = (p: P) => <svg {...base(p)}><path d="M3.5 7.8h2.8L10 4.5v11l-3.7-3.3H3.5z" /><path d="M13 7.6a3.3 3.3 0 0 1 0 4.8" /><path d="M15.2 5.4a6.3 6.3 0 0 1 0 9.2" /></svg>;
export const MuteIcon = (p: P) => <svg {...base(p)}><path d="M3.5 7.8h2.8L10 4.5v11l-3.7-3.3H3.5z" /><path d="m13 8 4 4m0-4-4 4" /></svg>;
export const FullscreenIcon = (p: P) => <svg {...base(p)}><path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" /></svg>;
export const ExitFullscreenIcon = (p: P) => <svg {...base(p)}><path d="M7.5 3.5v4h-4M12.5 3.5v4h4M7.5 16.5v-4h-4M12.5 16.5v-4h4" /></svg>;
export const TracksIcon = (p: P) => <svg {...base(p)}><rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2" /><path d="M6 10.6h3M11 10.6h3M6 13h5" /></svg>;
export const SettingsIcon = (p: P) => <svg {...base(p)}><path d="M3.5 6h8M15 6h1.5M3.5 14h1.5M8.5 14h8" /><circle cx="13.2" cy="6" r="1.8" /><circle cx="6.8" cy="14" r="1.8" /></svg>;
export const InfoIcon = (p: P) => <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.6M10 6.4v.1" /></svg>;
export const QueueIcon = (p: P) => <svg {...base(p)}><path d="M3.5 5.5h9M3.5 10h9M3.5 14.5h5.5" /><path d="M13 12.2v5l4-2.5z" fill="currentColor" stroke="none" /></svg>;
export const LoopIcon = (p: P) => <svg {...base(p)}><path d="M14 3.2 16.5 5.7 14 8.2" /><path d="M3.5 10V9a3.3 3.3 0 0 1 3.3-3.3h9.7" /><path d="M6 16.8 3.5 14.3 6 11.8" /><path d="M16.5 10v1a3.3 3.3 0 0 1-3.3 3.3H3.5" /></svg>;
export const CloseIcon = (p: P) => <svg {...base(p)}><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>;
export const ChevronLeftIcon = (p: P) => <svg {...base(p)}><path d="m12 4.5-5.5 5.5 5.5 5.5" /></svg>;
export const ChevronRightIcon = (p: P) => <svg {...base(p)}><path d="m8 4.5 5.5 5.5L8 15.5" /></svg>;
export const ChevronDownIcon = (p: P) => <svg {...base(p)}><path d="m4.5 8 5.5 5.5L15.5 8" /></svg>;
export const ChevronUpIcon = (p: P) => <svg {...base(p)}><path d="m4.5 12.5 5.5-5.5 5.5 5.5" /></svg>;
export const PlusIcon = (p: P) => <svg {...base(p)}><path d="M10 4v12M4 10h12" /></svg>;
export const CheckIcon = (p: P) => <svg {...base(p)}><path d="m4.2 10.4 3.7 3.7 7.9-8.2" /></svg>;
export const SearchIcon = (p: P) => <svg {...base(p)}><circle cx="8.8" cy="8.8" r="5.3" /><path d="m12.8 12.8 3.7 3.7" /></svg>;
export const FolderIcon = (p: P) => <svg {...base(p)}><path d="M2.8 6.2a1.6 1.6 0 0 1 1.6-1.6h3.4l1.7 1.8h6.1a1.6 1.6 0 0 1 1.6 1.6v6.6a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" /></svg>;
export const FileIcon = (p: P) => <svg {...base(p)}><path d="M5.2 2.8h6.3l3.3 3.3v11.1H5.2z" /><path d="M11.3 2.8v3.5h3.5" /></svg>;
export const GripIcon = (p: P) => <svg {...base(p)}><path d="M7.5 5.5v.1M7.5 10v.1M7.5 14.5v.1M12.5 5.5v.1M12.5 10v.1M12.5 14.5v.1" strokeWidth={2.4} /></svg>;
export const KeyboardIcon = (p: P) => <svg {...base(p)}><rect x="2.5" y="5" width="15" height="10" rx="1.8" /><path d="M5.5 8h.1M8.5 8h.1M11.5 8h.1M14.5 8h.1M6.5 12h7" /></svg>;
export const TrashIcon = (p: P) => <svg {...base(p)}><path d="M4 5.8h12M8 5.8V4h4v1.8M5.6 5.8l.7 10.4h7.4l.7-10.4" /></svg>;
export const RefreshIcon = (p: P) => <svg {...base(p)}><path d="M15.8 8.3A6 6 0 0 0 4.6 7M4.2 11.7a6 6 0 0 0 11.2 1.3" /><path d="M15.8 3.8v4.5h-4.5M4.2 16.2v-4.5h4.5" /></svg>;
export const GridIcon = (p: P) => <svg {...base(p)}><rect x="3.5" y="4" width="5.5" height="5" rx="1" /><rect x="11" y="4" width="5.5" height="5" rx="1" /><rect x="3.5" y="11" width="5.5" height="5" rx="1" /><rect x="11" y="11" width="5.5" height="5" rx="1" /></svg>;
export const ListIcon = (p: P) => <svg {...base(p)}><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" /><path d="M3.6 5.5h.8M3.6 10h.8M3.6 14.5h.8" strokeWidth={2} /></svg>;
export const MoreIcon = (p: P) => <svg {...base(p)}><circle cx="4.6" cy="10" r="1.25" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="1.25" fill="currentColor" stroke="none" /><circle cx="15.4" cy="10" r="1.25" fill="currentColor" stroke="none" /></svg>;
export const CameraIcon = (p: P) => <svg {...base(p)}><path d="M3 6.8h3l1.4-2.3h5.2L14 6.8h3v9H3z" /><circle cx="10" cy="11.2" r="2.7" /></svg>;
export const PencilIcon = (p: P) => <svg {...base(p)}><path d="M12.8 4.2 15.8 7.2 7.4 15.6H4.4v-3z" /><path d="m11 6 3 3" /></svg>;
export const ReplayIcon = (p: P) => <svg {...base(p)}><path d="M4.3 10a5.7 5.7 0 1 0 1.8-4.2" /><path d="M4 3.6v3.6h3.6" /></svg>;
export const SaveIcon = (p: P) => <svg {...base(p)}><path d="M4 3.5h9.5l2.5 2.5v10.5H4z" /><path d="M7 3.5v4h6v-4M7 16.5v-5h6v5" /></svg>;
export const ImmersiveIcon = (p: P) => <svg {...base(p)}><rect x="2.8" y="4.2" width="14.4" height="11.6" rx="1.6" /><path d="M2.8 13h14.4" /></svg>;

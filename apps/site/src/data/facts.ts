/**
 * Product facts with their status, transcribed from the RC1 test record
 * (docs/testing/rc1-local-windows.md), the redesign record
 * (docs/design/redesign-v2.md) and CHANGELOG.md. Status words follow the RC1
 * audit: Verified = exercised in the real app; Partial = present, not fully
 * re-exercised or with a limitation; Deferred = not built yet.
 */

export type FeatureStatus = "verified" | "partial" | "deferred" | "harness";

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  verified: "Verified",
  partial: "Partial",
  deferred: "Not built",
  harness: "Verified in harness",
};

export interface Feature {
  name: string;
  status: FeatureStatus;
  note?: string;
}

export const VERSION = {
  version: "0.1.0-rc.1",
  date: "2026-10-16",
  channel: "Local release candidate",
  platform: "Windows x64",
  tested: "Windows 11, one machine (i5-10300H, Intel UHD 630 + GTX 1650)",
};

export const FEATURES: Record<string, Feature[]> = {
  playback: [
    { name: "Open files from the dialog, by drag-and-drop or as a launch argument", status: "verified" },
    { name: "Play, pause, exact seek, volume, mute, speed 0.25–4×, fullscreen", status: "verified" },
    { name: "Frame step, aspect ratio, rotation, deinterlace, audio and subtitle delay", status: "verified" },
    { name: "Audio and subtitle tracks, external subtitle files", status: "partial", note: "Menus verified; loading an external subtitle was verified in an earlier pass, not re-run for RC1." },
    { name: "A–B loop", status: "verified" },
    { name: "Hardware decoding with automatic software fallback", status: "harness", note: "d3d11va / nvdec used where the GPU supports the profile; the Settings toggle itself is Partial." },
    { name: "Save the current frame to Pictures\\NOVA, then Show in folder", status: "verified" },
  ],
  continuity: [
    { name: "Resume where you stopped, across restarts", status: "verified", note: "Titles under 60 seconds do not resume, by design." },
    { name: "Continue and Recently added on Home", status: "verified" },
    { name: "Queue: next, previous, repeat, shuffle, reorder", status: "verified" },
    { name: "Saved playlists: save, open, rename, delete", status: "verified" },
    { name: "Edit a saved playlist's order", status: "deferred", note: "Open it, reorder the queue and save under a new name." },
    { name: "End of media: Play next, Play again, Back to library", status: "verified" },
  ],
  library: [
    { name: "Thumbnails, durations and spec lines", status: "verified" },
    { name: "Folders, background scan with progress and cancel", status: "partial", note: "Present; progress and cancel not re-exercised for RC1." },
    { name: "Search, A–Z / Newest sort, missing-file filter", status: "partial", note: "Rendered; typing a search not re-exercised for RC1." },
    { name: "Duplicate-file detection", status: "deferred", note: "The library keys on path; the same file in two places is listed twice." },
  ],
  insight: [
    { name: "Playback details: container, codec, size, frame rate, bit depth, chroma, alpha, HDR, decoder, sound", status: "verified" },
    { name: "A stream that can't be decoded: the rest keeps playing and a banner explains", status: "harness" },
    { name: "Files that won't play: the reason, what to try, and a way out", status: "verified" },
    { name: "Editing projects and camera RAW recognised and explained", status: "harness" },
    { name: "Formats page with honest support tiers", status: "verified" },
  ],
  control: [
    { name: "Every action on the keyboard, with a searchable keymap editor and conflict warnings", status: "verified" },
    { name: "Shortcuts help on F1 or ?", status: "verified" },
    { name: "Mouse wheel, click and double-click choices", status: "partial", note: "Settings render; wheel over the picture not re-exercised." },
    { name: "Daylight, Night or System theme; the player is always dark", status: "verified" },
  ],
};

export const KNOWN_ISSUES = [
  "Subtitles drawn by the engine can sit under the control bar while the controls are visible.",
  "Side panels and menus can't blur the video, which is a native surface below the interface; they use a 93% opaque fill instead.",
  "A playlist's duration reads “0:30 known”: correct, but awkward.",
  "Interface contrast was computed from colour tokens, not measured on rendered pixels.",
  "No timeline preview frames when hovering the seek bar.",
  "Alpha video is shown over black; image sequences, embedded timecode and camera RAW decoding are not built.",
];

/** Conditions for a public release, from ADR 0003, the RC1 record and brand/README.md. */
export const RELEASE_GATES: { name: string; state: "open" | "not-started" | "done"; detail: string; doc?: string }[] = [
  {
    name: "Engine licensing decision (ADR 0003)",
    state: "done",
    detail: "Decided 2026-10-16: option B. Releases will bundle an LGPL libmpv and FFmpeg built from source, not the GPL development build.",
    doc: "adr-0003",
  },
  {
    name: "Application licence",
    state: "done",
    detail: "Decided 2026-10-16: NOVA's own code is MIT OR Apache-2.0.",
    doc: "adr-0003",
  },
  {
    name: "LGPL engine build",
    state: "not-started",
    detail: "Build mpv with -Dgpl=false and FFmpeg without GPL or non-free parts, reproducibly, record the exact configuration, and check the result contains no GPL code. Then rebuild the installer with it.",
    doc: "adr-0003",
  },
  {
    name: "Third-party notices and licence review",
    state: "not-started",
    detail: "An initial inventory exists. Still to do: automated checks (cargo deny / cargo about, an npm licence checker), notices and LGPL source information shipped with the installer.",
    doc: "adr-0003",
  },
  {
    name: "Clean-machine install test",
    state: "not-started",
    detail: "Installed and tested on the development machine only. Not tested: a clean Windows install, machines without the GPU driver's Vulkan loader, per-machine install, uninstall, file associations.",
    doc: "rc1-test-record",
  },
  {
    name: "Installer signing and SmartScreen",
    state: "not-started",
    detail: "The local installer is unsigned. How Windows SmartScreen treats it has not been tested.",
    doc: "rc1-test-record",
  },
  {
    name: "Trademark search for the name and mark",
    state: "not-started",
    detail: "No clearance search has been made for “NOVA” or the Lumen N.",
  },
];

/**
 * Comparison. Facts about other players come from their official pages,
 * checked on 2026-10-16. Cells we could not source say so.
 */
export const COMPARE_CHECKED = "2026-10-16";

export interface CompareCell {
  text: string;
  /** Index into COMPARE_SOURCES. */
  src?: number;
  /** NOVA cells: how sure we are. */
  status?: "verified" | "partial" | "planned" | "decided" | "none";
}

export const COMPARE_SOURCES = [
  { label: "VLC media player — videolan.org/vlc", url: "https://www.videolan.org/vlc/" },
  { label: "VideoLAN legal page — videolan.org/legal.html", url: "https://www.videolan.org/legal.html" },
  { label: "mpv — mpv.io", url: "https://mpv.io/" },
  { label: "mpv README — github.com/mpv-player/mpv", url: "https://github.com/mpv-player/mpv" },
  { label: "mpv manual — mpv.io/manual/stable", url: "https://mpv.io/manual/stable/" },
  { label: "MPC-HC README — github.com/clsid2/mpc-hc", url: "https://github.com/clsid2/mpc-hc" },
];

export const PLAYERS = ["NOVA", "VLC", "mpv", "MPC-HC"] as const;

export const COMPARE_ROWS: { label: string; cells: [CompareCell, CompareCell, CompareCell, CompareCell] }[] = [
  {
    label: "Availability",
    cells: [
      { text: "Preview. Not downloadable until the LGPL engine build ships.", status: "none" },
      { text: "Released; current version 3.0.24 for Windows.", src: 0 },
      { text: "Released; developed in public on GitHub.", src: 3 },
      { text: "Maintained fork since 2017; not accepting feature requests for now.", src: 5 },
    ],
  },
  {
    label: "Platforms",
    cells: [
      { text: "Windows only, by design. x64; tested on Windows 11.", status: "partial" },
      { text: "Windows, macOS, Linux, Android, iOS, Apple TV, ChromeOS, BSDs and more.", src: 0 },
      { text: "Linux, Windows 10 1607+, macOS 10.15+.", src: 3 },
      { text: "Windows 7 to 11.", src: 5 },
    ],
  },
  {
    label: "Licence",
    cells: [
      { text: "MIT OR Apache-2.0, decided 2026-10-16. Releases bundle an LGPL engine. Source not public yet.", status: "decided" },
      { text: "Free and open source; most VideoLAN software is GPLv2.", src: 1 },
      { text: "GPLv2 or later; LGPLv2.1 or later with -Dgpl=false.", src: 3 },
      { text: "GPLv3.", src: 5 },
    ],
  },
  {
    label: "Playback engine",
    cells: [
      { text: "libmpv (mpv's library) with FFmpeg decoders.", status: "verified" },
      { text: "VLC's own engine.", src: 0 },
      { text: "mpv; usable as a library through its C API.", src: 2 },
      { text: "DirectShow player with internal codecs from LAV Filters.", src: 5 },
    ],
  },
  {
    label: "Interface",
    cells: [
      { text: "A full app: Home, Library, player deck, Settings, Daylight and Night.", status: "verified" },
      { text: "A full graphical interface.", src: 0 },
      { text: "No full GUI; a small on-screen controller, command line and scripts.", src: 2 },
      { text: "A classic Windows interface.", src: 5 },
    ],
  },
  {
    label: "Resume playback",
    cells: [
      { text: "Automatic for titles over 60 seconds, across restarts; moved files keep progress.", status: "verified" },
      { text: "Not checked for this page.", },
      { text: "Off by default; --save-position-on-quit or Shift+Q.", src: 4 },
      { text: "Not checked for this page." },
    ],
  },
  {
    label: "Tracking statement",
    cells: [
      { text: "No account, telemetry or analytics code. Network traffic has not been captured to prove it.", status: "partial" },
      { text: "“No spyware, no ads and no user tracking.”", src: 0 },
      { text: "Not stated on the pages checked." },
      { text: "Not stated on the pages checked." },
    ],
  },
];

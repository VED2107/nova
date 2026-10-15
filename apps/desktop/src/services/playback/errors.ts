import type { PlaybackError } from "./types";

/** Turns an engine error into an explanation and safe next steps. */
export function describeError(err: PlaybackError): { title: string; detail: string; steps: string[] } {
  switch (err.kind) {
    case "notFound":
      return {
        title: "File not found",
        detail: "The file was moved, renamed, or is on a drive that isn't connected.",
        steps: ["Reconnect the drive if the file lives on one", "Open the file again from its new location"],
      };
    case "unsupportedSource":
      return {
        title: "Only local files for now",
        detail: "This version of NOVA plays files stored on this computer.",
        steps: ["Download the media first, then open the local copy"],
      };
    case "loadFailed":
      return {
        title: "NOVA couldn't play this file",
        detail: "The file may be damaged, incomplete, or not a media file.",
        steps: ["Check that the file plays elsewhere", "If it was downloading, wait for it to finish", "Try another file"],
      };
    case "engineUnavailable":
      return {
        title: "Playback engine missing",
        detail: "NOVA couldn't start its media engine (libmpv).",
        steps: ["Reinstall NOVA", "Developers: run scripts/fetch-libmpv.sh"],
      };
    case "editingProject":
      return {
        title: "This is an editing project, not a video",
        detail: err.message,
        steps: ["Open it in the editing app that created it", "Export or render the timeline to a video file, then open that file in NOVA"],
      };
    case "requiresExternalDecoder":
      return {
        title: "This camera RAW format needs its maker's decoder",
        detail: err.message,
        steps: ["Use the manufacturer's player or DaVinci Resolve", "Or export a ProRes or H.264 version and open that"],
      };
    default:
      return { title: "Something went wrong", detail: "The playback engine reported an error.", steps: ["Try opening the file again"] };
  }
}

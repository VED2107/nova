import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { SnapshotStore } from "./store";
import type { CommandAck, MediaDetails, PlaybackCommand, PlaybackError, PlaybackSnapshot, QueueSnapshot, RepeatMode } from "./types";
import { EMPTY_QUEUE } from "./types";

export const SNAPSHOT_EVENT = "playback://snapshot";
export const QUEUE_EVENT = "queue://changed";
export const RESUMED_EVENT = "playback://resumed";

export interface ResumeNotice {
  sessionId: number;
  positionMs: number;
}

let resumeNotice: ResumeNotice | null = null;
const resumeListeners = new Set<() => void>();
export function useResumeNotice(): ResumeNotice | null {
  return useSyncExternalStore(
    (l) => {
      resumeListeners.add(l);
      return () => resumeListeners.delete(l);
    },
    () => resumeNotice,
  );
}

export interface EngineInfo {
  capabilities: {
    backend: string;
    backendVersion: string;
    canSeekExact: boolean;
    canSelectTracks: boolean;
    canChangeSpeed: boolean;
    hardwareDecoding: boolean;
  };
  mpvVersion: string | null;
  ffmpegVersion: string | null;
  videoOutput: string | null;
  audioOutput: string | null;
  gpuContext: string | null;
  hwdecCurrent: string | null;
  libraryPath: string;
}

export const store = new SnapshotStore();
let started = false;

// The queue is updated only by native events/results, newest wins.
let queueSnapshot: QueueSnapshot = EMPTY_QUEUE;
const queueListeners = new Set<() => void>();
function setQueue(q: QueueSnapshot) {
  queueSnapshot = q;
  queueListeners.forEach((l) => l());
}
const subscribeQueue = (l: () => void) => {
  queueListeners.add(l);
  return () => queueListeners.delete(l);
};
export function useQueue(): QueueSnapshot {
  return useSyncExternalStore(subscribeQueue, () => queueSnapshot);
}

const queueCall = (cmd: string, args?: Record<string, unknown>) =>
  invoke<QueueSnapshot>(cmd, args).then((q) => {
    setQueue(q);
    return q;
  });

export const queue = {
  open: (paths: string[]) => queueCall("queue_open", { paths }),
  append: (paths: string[]) => queueCall("queue_append", { paths }),
  select: (id: number) => queueCall("queue_select", { id }),
  next: () => queueCall("queue_next"),
  previous: () => queueCall("queue_previous"),
  remove: (id: number) => queueCall("queue_remove", { id }),
  move: (id: number, to: number) => queueCall("queue_move", { id, to }),
  clear: () => queueCall("queue_clear"),
  setRepeat: (mode: RepeatMode) => queueCall("queue_set_repeat", { mode }),
  shuffle: () => queueCall("queue_shuffle"),
};

/** Starts listening for engine snapshots. Idempotent. */
export async function startPlaybackBridge(): Promise<void> {
  if (started) return;
  started = true;
  await listen<PlaybackSnapshot>(SNAPSHOT_EVENT, (e) => store.push(e.payload));
  await listen<QueueSnapshot>(QUEUE_EVENT, (e) => setQueue(e.payload));
  await listen<ResumeNotice>(RESUMED_EVENT, (e) => {
    resumeNotice = e.payload;
    resumeListeners.forEach((l) => l());
  });
  invoke<QueueSnapshot>("queue_get").then(setQueue, () => {});
  try {
    store.push(await invoke<PlaybackSnapshot>("playback_snapshot"));
  } catch {
    // Engine unavailable; surfaced via engineInfo() failure.
  }
}

export function execute(command: PlaybackCommand): Promise<CommandAck> {
  return invoke<CommandAck>("playback_execute", { command });
}

export const engineInfo = () => invoke<EngineInfo>("engine_info");
export const mediaDetails = () => invoke<MediaDetails | null>("playback_media_details");
/** Saves the current frame to Pictures\NOVA; returns the file path. */
export const screenshot = (withSubtitles: boolean) => invoke<string>("playback_screenshot", { withSubtitles });
export const launchMediaPaths = () => invoke<string[]>("launch_media_paths");

export function isPlaybackError(e: unknown): e is PlaybackError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

export function usePlayback(): PlaybackSnapshot {
  return useSyncExternalStore(store.subscribe, store.get);
}

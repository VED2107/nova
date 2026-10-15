import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { SnapshotStore } from "./store";
import type { CommandAck, PlaybackCommand, PlaybackError, PlaybackSnapshot, QueueSnapshot } from "./types";
import { EMPTY_QUEUE } from "./types";

export const SNAPSHOT_EVENT = "playback://snapshot";
export const QUEUE_EVENT = "queue://changed";

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
};

/** Starts listening for engine snapshots. Idempotent. */
export async function startPlaybackBridge(): Promise<void> {
  if (started) return;
  started = true;
  await listen<PlaybackSnapshot>(SNAPSHOT_EVENT, (e) => store.push(e.payload));
  await listen<QueueSnapshot>(QUEUE_EVENT, (e) => setQueue(e.payload));
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
export const launchMediaPaths = () => invoke<string[]>("launch_media_paths");

export function isPlaybackError(e: unknown): e is PlaybackError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

export function usePlayback(): PlaybackSnapshot {
  return useSyncExternalStore(store.subscribe, store.get);
}

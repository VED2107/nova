import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { SnapshotStore } from "./store";
import type { CommandAck, PlaybackCommand, PlaybackError, PlaybackSnapshot } from "./types";

export const SNAPSHOT_EVENT = "playback://snapshot";

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

/** Starts listening for engine snapshots. Idempotent. */
export async function startPlaybackBridge(): Promise<void> {
  if (started) return;
  started = true;
  await listen<PlaybackSnapshot>(SNAPSHOT_EVENT, (e) => store.push(e.payload));
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
export const launchMediaPath = () => invoke<string | null>("launch_media_path");

export function isPlaybackError(e: unknown): e is PlaybackError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

export function usePlayback(): PlaybackSnapshot {
  return useSyncExternalStore(store.subscribe, store.get);
}

import type { PlaybackSnapshot } from "./types";
import { INITIAL_SNAPSHOT } from "./types";

/**
 * Holds the latest engine-confirmed snapshot. Snapshots can arrive from two
 * native threads, so anything older than what we already have is dropped.
 */
export class SnapshotStore {
  private current: PlaybackSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();

  get = (): PlaybackSnapshot => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Returns true if the snapshot was accepted. */
  push(next: PlaybackSnapshot): boolean {
    if (next.seq <= this.current.seq && this.current.seq !== 0) return false;
    this.current = next;
    this.listeners.forEach((l) => l());
    return true;
  }
}

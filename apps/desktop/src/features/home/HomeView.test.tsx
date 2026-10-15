// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LibraryItem, PlaylistSummary } from "../../services/library/types";

const continueWatching = vi.fn<() => Promise<LibraryItem[]>>();
const recentlyAdded = vi.fn<() => Promise<LibraryItem[]>>();
const playlists = vi.fn<() => Promise<PlaylistSummary[]>>();
vi.mock("../../services/library/client", () => ({
  library: {
    continueWatching: () => continueWatching(),
    recentlyAdded: () => recentlyAdded(),
    playlists: () => playlists(),
    roots: () => Promise.resolve([]),
    onChanged: () => Promise.resolve(() => {}),
  },
  thumbnailUrl: () => null,
}));
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}

const { HomeView } = await import("./HomeView");

const item = (id: number, title: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  title,
  path: `C:\\m\\${title}.mkv`,
  folder: "C:\\m\\Shows",
  sizeBytes: 1_500_000_000,
  missing: false,
  progress: { positionMs: 600_000, durationMs: 1_800_000, completed: false },
  durationMs: 1_800_000,
  width: 1920,
  height: 1080,
  hasThumbnail: false,
  ...over,
});
const handlers = () => ({ onPlay: vi.fn(), onPlayPlaylist: vi.fn(), onOpenLibrary: vi.fn(), onOpenFile: vi.fn(), onAddFolder: vi.fn() });

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("HomeView", () => {
  it("leads with the most recent title: catalogue number, spec line, time left, Resume", async () => {
    const a = item(42, "Episode 4");
    continueWatching.mockResolvedValue([a, item(7, "Gone", { missing: true })]);
    recentlyAdded.mockResolvedValue([item(3, "New Film", { progress: null })]);
    playlists.mockResolvedValue([]);
    const h = handlers();
    render(<HomeView {...h} />);
    expect(await screen.findByRole("heading", { name: "Episode 4" })).toBeTruthy();
    const lead = within(screen.getByRole("article", { name: "Episode 4" }));
    expect(lead.getByText("No. 042")).toBeTruthy();
    expect(lead.getByText("20 min left")).toBeTruthy();
    expect(screen.getAllByText(/1080p · 30:00 · 1\.4 GB/).length).toBeGreaterThan(0);
    fireEvent.click(lead.getByRole("button", { name: /Resume/ }));
    expect(h.onPlay).toHaveBeenCalledWith(a);
    expect((screen.getByRole("button", { name: /Gone/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByRole("button", { name: /New Film/ })).toBeTruthy();
  });

  it("lists playlists and asks before deleting one", async () => {
    continueWatching.mockResolvedValue([]);
    recentlyAdded.mockResolvedValue([item(3, "New Film", { progress: null })]);
    playlists.mockResolvedValue([{ id: 9, name: "Evening", itemCount: 2, knownDurationMs: null, updatedAtMs: 0 }]);
    const h = handlers();
    render(<HomeView {...h} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Evening/ }));
    expect(h.onPlayPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete playlist Evening" }));
    expect(screen.getByRole("button", { name: "Delete playlist" })).toBeTruthy();
  });

  it("shows an empty shelf that leads to adding a folder", async () => {
    continueWatching.mockResolvedValue([]);
    recentlyAdded.mockResolvedValue([]);
    playlists.mockResolvedValue([]);
    const h = handlers();
    render(<HomeView {...h} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a folder" }));
    expect(h.onAddFolder).toHaveBeenCalled();
  });
});

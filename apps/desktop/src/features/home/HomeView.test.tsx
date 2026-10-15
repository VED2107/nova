// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LibraryItem } from "../../services/library/types";

const continueWatching = vi.fn<() => Promise<LibraryItem[]>>();
const recentlyAdded = vi.fn<() => Promise<LibraryItem[]>>();
vi.mock("../../services/library/client", () => ({
  library: {
    continueWatching: () => continueWatching(),
    recentlyAdded: () => recentlyAdded(),
    onChanged: () => Promise.resolve(() => {}),
  },
}));

const { HomeView } = await import("./HomeView");

const item = (id: number, title: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id, title, path: `C:\m\${title}.mkv`, folder: "C:\m\Shows", sizeBytes: 1, missing: false,
  progress: { positionMs: 600_000, durationMs: 1_800_000, completed: false }, ...over,
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("HomeView", () => {
  it("shows Continue Watching with time left and plays on click", async () => {
    const a = item(1, "Episode 4");
    continueWatching.mockResolvedValue([a, item(2, "Gone", { missing: true })]);
    recentlyAdded.mockResolvedValue([item(3, "New Film", { progress: null })]);
    const onPlay = vi.fn();
    render(<HomeView onPlay={onPlay} onOpenLibrary={() => {}} onOpenFile={() => {}} />);
    const card = await screen.findByRole("button", { name: /Episode 4/ });
    expect(card.textContent).toContain("20 min left");
    fireEvent.click(card);
    expect(onPlay).toHaveBeenCalledWith(a);
    expect((await screen.findByRole("button", { name: /Gone/ })).hasAttribute("disabled")).toBe(true);
    expect(await screen.findByText("New Film")).toBeTruthy();
  });

  it("shows an empty state that leads to adding a folder", async () => {
    continueWatching.mockResolvedValue([]);
    recentlyAdded.mockResolvedValue([]);
    const onOpenLibrary = vi.fn();
    render(<HomeView onPlay={() => {}} onOpenLibrary={onOpenLibrary} onOpenFile={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a folder" }));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});

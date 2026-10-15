// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LibraryItem, SearchPage } from "../../services/library/types";

const search = vi.fn<(q: string, sort: string, inc: boolean, offset: number, limit: number, rootId: number | null) => Promise<SearchPage>>();
const cancelScans = vi.fn(() => Promise.resolve());
const removeRoot = vi.fn(() => Promise.resolve());
let scanListener: ((p: unknown) => void) | null = null;
vi.mock("../../services/library/client", () => ({
  library: {
    roots: () => Promise.resolve([{ id: 1, path: "C:\\Media", itemCount: 2, missingCount: 0, lastScan: { status: "completed" } }]),
    scanStatus: () => Promise.resolve({ current: null, queued: [] }),
    search: (q: string, s: string, i: boolean, o: number, l: number, r: number | null) => search(q, s, i, o, l, r),
    cancelScans: () => cancelScans(),
    removeRoot: () => removeRoot(),
    rescan: () => Promise.resolve(),
    onScan: (cb: (p: unknown) => void) => {
      scanListener = cb;
      return Promise.resolve(() => {});
    },
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

const { LibraryView } = await import("./LibraryView");

const item = (id: number, title: string): LibraryItem => ({
  id,
  title,
  path: `C:\\Media\\${title}.mkv`,
  folder: "C:\\Media",
  sizeBytes: 2048,
  missing: false,
  progress: null,
  durationMs: 90_000,
  width: 1280,
  height: 720,
  hasThumbnail: false,
});
const noop = () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryView", () => {
  it("searches with the typed query and shows the title count", async () => {
    search.mockImplementation(async (q) =>
      q === "night" ? { items: [item(2, "Night Shift")], total: 1 } : { items: [item(1, "Alpha"), item(2, "Night Shift")], total: 2 },
    );
    render(<LibraryView onPlay={noop} onAddFolder={noop} />);
    expect(await screen.findByText("2 titles", { selector: "p" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), { target: { value: "night" } });
    expect(await screen.findByText("1 title", { selector: "p" })).toBeTruthy();
    expect(search).toHaveBeenLastCalledWith("night", "relevance", false, 0, 100, null);
  });

  it("limits the list to a folder chosen in the folder rail", async () => {
    search.mockResolvedValue({ items: [item(1, "Alpha")], total: 1 });
    render(<LibraryView onPlay={noop} onAddFolder={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Media/ }));
    await waitFor(() => expect(search).toHaveBeenLastCalledWith("", "relevance", false, 0, 100, 1));
  });

  it("shows a no-match message", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={noop} onAddFolder={noop} />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search library" }), { target: { value: "zzz" } });
    expect(await screen.findByText(/No titles match/)).toBeTruthy();
  });

  it("shows scan progress and cancels", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={noop} onAddFolder={noop} />);
    await waitFor(() => expect(scanListener).not.toBeNull());
    scanListener!({ rootId: 1, state: "scanning", filesSeen: 1234, filesAdded: 10, filesUpdated: 0, filesMissing: 0, errors: 0, skippedLinks: 0, lastError: null });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1,234"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelScans).toHaveBeenCalled();
  });

  it("asks before removing a folder and keeps it on Keep", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={noop} onAddFolder={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Media/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove folder from library?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(removeRoot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Remove folder from library?" })).getByRole("button", { name: "Remove folder" }));
    expect(removeRoot).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LibraryItem, SearchPage } from "../../services/library/types";

const search = vi.fn<(q: string, sort: string, inc: boolean, offset: number, limit: number) => Promise<SearchPage>>();
const cancelScans = vi.fn(() => Promise.resolve());
let scanListener: ((p: unknown) => void) | null = null;
vi.mock("../../services/library/client", () => ({
  library: {
    roots: () => Promise.resolve([{ id: 1, path: "C:\Media", itemCount: 2, missingCount: 0, lastScan: null }]),
    scanStatus: () => Promise.resolve({ current: null, queued: [] }),
    search: (q: string, s: string, i: boolean, o: number, l: number) => search(q, s, i, o, l),
    cancelScans: () => cancelScans(),
    onScan: (cb: (p: unknown) => void) => {
      scanListener = cb;
      return Promise.resolve(() => {});
    },
    onChanged: () => Promise.resolve(() => {}),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const { LibraryView } = await import("./LibraryView");

const item = (id: number, title: string): LibraryItem => ({
  id, title, path: `C:\Media\${title}.mkv`, folder: "C:\Media", sizeBytes: 2048, missing: false, progress: null,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryView", () => {
  it("searches with the typed query and shows the result count", async () => {
    search.mockImplementation(async (q) =>
      q === "night" ? { items: [item(2, "Night Shift")], total: 1 } : { items: [item(1, "Alpha"), item(2, "Night Shift")], total: 2 },
    );
    render(<LibraryView onPlay={() => {}} />);
    expect(await screen.findByText("2 items")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), { target: { value: "night" } });
    expect(await screen.findByText("1 item")).toBeTruthy();
    expect(search).toHaveBeenLastCalledWith("night", "relevance", false, 0, 100);
  });

  it("shows a no-match message", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={() => {}} />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search library" }), { target: { value: "zzz" } });
    expect(await screen.findByText(/No matches for/)).toBeTruthy();
  });

  it("shows scan progress and cancels", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={() => {}} />);
    await waitFor(() => expect(scanListener).not.toBeNull());
    scanListener!({ rootId: 1, state: "scanning", filesSeen: 1234, filesAdded: 10, filesUpdated: 0, filesMissing: 0, errors: 0, skippedLinks: 0, lastError: null });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1,234"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelScans).toHaveBeenCalled();
  });

  it("asks before removing a folder", async () => {
    search.mockResolvedValue({ items: [], total: 0 });
    render(<LibraryView onPlay={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove…" }));
    expect(screen.getByRole("button", { name: "Remove from library" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("button", { name: "Remove from library" })).toBeNull();
  });
});

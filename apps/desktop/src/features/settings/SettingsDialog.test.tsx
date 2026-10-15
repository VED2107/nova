// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve({})) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTheme: () => Promise.resolve() }) }));
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}

const { SettingsDialog } = await import("./SettingsDialog");

afterEach(cleanup);

describe("Settings › Keys & mouse", () => {
  it("finds actions by name or by key", () => {
    render(<SettingsDialog open onClose={() => {}} initialSection="controls" />);
    const find = screen.getByRole("searchbox", { name: "Find an action or key" });
    const rowFor = (label: string) => screen.queryAllByRole("listitem").find((li) => li.textContent?.startsWith(label)) ?? null;
    expect(rowFor("Play / pause")).toBeTruthy();

    fireEvent.change(find, { target: { value: "subtitle" } });
    expect(rowFor("Play / pause")).toBeNull();
    expect(rowFor("Add subtitle file…")).toBeTruthy();

    fireEvent.change(find, { target: { value: "shift+s" } });
    expect(rowFor("Save frame to Pictures")).toBeTruthy();
    expect(rowFor("Add subtitle file…")).toBeNull();

    fireEvent.change(find, { target: { value: "zzz" } });
    expect(screen.getByText(/No action or key matches/)).toBeTruthy();
  });
});

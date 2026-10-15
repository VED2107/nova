// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Dialog } from "./Dialog";

// jsdom has no showModal; mimic the browser, which focuses the first focusable element (the close button).
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>("button, input")?.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

afterEach(cleanup);

describe("Dialog", () => {
  it("moves focus to the [data-autofocus] field once the modal is shown", () => {
    render(
      <Dialog open onClose={() => {}} title="Go to time">
        <input aria-label="Time" data-autofocus />
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Time" }));
  });
});

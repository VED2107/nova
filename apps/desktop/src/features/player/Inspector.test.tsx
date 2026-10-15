// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { MediaDetails } from "../../services/playback/types";

const details: MediaDetails = {
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  fileSizeBytes: 48_861_983,
  durationMs: 3000,
  video: {
    codec: "prores", codecDescription: "Apple ProRes (iCodec Pro)", width: 1920, height: 1080,
    pixelFormat: "yuva444p12", bitDepth: 12, chroma: "4:4:4", hasAlpha: true, frameRate: 25,
    colorMatrix: "bt.709", primaries: "bt.709", transfer: "bt.1886", hdr: null, hwdec: null, decoder: "prores",
  },
  audio: null,
};
vi.mock("../../services/playback/client", () => ({ mediaDetails: () => Promise.resolve(details) }));
const { Inspector } = await import("./Inspector");

afterEach(cleanup);

describe("Inspector", () => {
  it("shows engine-reported professional stream details", async () => {
    render(<Inspector open sessionId={1} engine={null} />);
    expect(await screen.findByText("Apple ProRes (iCodec Pro)")).toBeTruthy();
    expect(screen.getByText("12-bit 4:4:4 · alpha")).toBeTruthy();
    expect(screen.getByText("1920×1080 · 25 fps")).toBeTruthy();
    expect(screen.getByText("SDR")).toBeTruthy();
    expect(screen.getByText("Software")).toBeTruthy();
    expect(screen.getByText("mov")).toBeTruthy();
    expect(screen.getByText(/47 MB · 130.3 Mb\/s/)).toBeTruthy();
  });
});

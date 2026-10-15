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
    colorMatrix: null, primaries: "bt.709", transfer: "bt.1886", hdr: null, hwdec: null, decoder: "prores",
  },
  audio: null,
};
vi.mock("../../services/playback/client", () => ({ mediaDetails: () => Promise.resolve(details) }));
const { Inspector } = await import("./Inspector");

afterEach(cleanup);

describe("Inspector", () => {
  it("prints engine-reported professional stream details and separates unknown from absent", async () => {
    render(<Inspector open sessionId={1} engine={null} issues={[]} />);
    expect((await screen.findAllByText(/Apple ProRes \(iCodec Pro\)/)).length).toBeGreaterThan(0);
    expect(screen.getByText("12-bit")).toBeTruthy();
    expect(screen.getByText("4:4:4")).toBeTruthy();
    expect(screen.getByText("Yes (shown over black)")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
    expect(screen.getByText("25 fps")).toBeTruthy();
    expect(screen.getByText("SDR")).toBeTruthy();
    expect(screen.getByText("mov")).toBeTruthy();
    expect(screen.getByText(/47 MB · 130.3 Mb\/s/)).toBeTruthy();
    // Audio stream absent = "None in this file"; matrix not reported by the engine = "Not reported".
    expect(screen.getByText("None in this file")).toBeTruthy();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
  });

  it("explains a missing decoder in plain language", async () => {
    render(<Inspector open sessionId={1} engine={null} issues={[{ kind: "videoDecoderMissing", codec: "unknown" }]} />);
    expect(await screen.findByText("Video can't be decoded")).toBeTruthy();
  });
});

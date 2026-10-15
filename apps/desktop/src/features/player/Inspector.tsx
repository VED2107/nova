import { useEffect, useState } from "react";
import { mediaDetails, type EngineInfo } from "../../services/playback/client";
import { formatBytes } from "../../services/library/view";
import type { MediaDetails } from "../../services/playback/types";

const dash = "—";

/** Engine-reported stream details (never inferred from the file name). */
export function Inspector({ open, sessionId, engine }: { open: boolean; sessionId: number; engine: EngineInfo | null }) {
  const [d, setD] = useState<MediaDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => mediaDetails().then((x) => alive && setD(x), () => alive && setD(null));
    load();
    // Decoder/hwdec can change shortly after start; refresh while open.
    const t = window.setInterval(load, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [open, sessionId]);

  const v = d?.video;
  const a = d?.audio;
  const bitrate = d?.fileSizeBytes && d.durationMs ? (d.fileSizeBytes * 8) / (d.durationMs / 1000) / 1e6 : null;
  const rows: [string, string][] = [
    ["Container", d?.container?.split(",")[0] ?? dash],
    ["Size", d?.fileSizeBytes ? `${formatBytes(d.fileSizeBytes)}${bitrate ? ` · ${bitrate.toFixed(1)} Mb/s` : ""}` : dash],
    ["Video", v ? `${v.codecDescription ?? v.codec ?? dash}` : "None"],
    ["Resolution", v?.width ? `${v.width}×${v.height}${v.frameRate ? ` · ${+v.frameRate.toFixed(3)} fps` : ""}` : dash],
    ["Format", v?.bitDepth ? `${v.bitDepth}-bit ${v.chroma ?? ""}${v.hasAlpha ? " · alpha" : ""}` : dash],
    ["Color", v ? [v.colorMatrix, v.primaries, v.transfer].filter(Boolean).join(" · ") || dash : dash],
    ["HDR", v ? (v.hdr ?? "SDR") : dash],
    ["Decoder", v ? (v.hwdec ? `Hardware (${v.hwdec})` : "Software") : dash],
    ["Audio", a ? `${a.codecDescription ?? a.codec ?? dash}` : "None"],
    ["Channels", a?.channels ? `${a.channelLayout ?? a.channels} · ${a.sampleRate ? `${a.sampleRate / 1000} kHz` : ""}${a.sampleFormat ? ` · ${a.sampleFormat}` : ""}` : dash],
    ["Output", engine ? `${engine.videoOutput ?? "?"} / ${engine.gpuContext ?? "?"}` : dash],
    ["Engine", engine?.mpvVersion ?? dash],
  ];

  return (
    <dl className="grid w-80 grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-2.5 text-xs" aria-label="Playback details">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-ash">{k}</dt>
          <dd className="truncate text-cream" title={val}>{val}</dd>
        </div>
      ))}
    </dl>
  );
}

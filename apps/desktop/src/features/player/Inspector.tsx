import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "../../components/icons";
import { IconButton } from "../../components/ui/controls";
import { mediaDetails, type EngineInfo } from "../../services/playback/client";
import { formatBytes } from "../../services/library/view";
import type { MediaDetails, PlaybackIssue } from "../../services/playback/types";

const NOT_REPORTED = "Not reported";

/**
 * Playback details printed like a disc back cover: engine-reported facts only.
 * "Not reported" = the engine gave no value (unknown); "None" = the stream
 * does not exist (unavailable). Advanced detail sits behind a disclosure.
 */
export function Inspector(props: { open: boolean; sessionId: number; engine: EngineInfo | null; issues: PlaybackIssue[]; onClose?: () => void }) {
  const [d, setD] = useState<MediaDetails | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    let alive = true;
    const load = () =>
      mediaDetails().then(
        (x) => {
          if (!alive) return;
          setD(x);
          setLoaded(true);
        },
        () => alive && setLoaded(true),
      );
    load();
    const t = window.setInterval(load, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [props.open, props.sessionId]);

  const v = d?.video;
  const a = d?.audio;
  const val = (x: string | number | null | undefined) => (x == null || x === "" ? NOT_REPORTED : String(x));
  const bitrate = d?.fileSizeBytes && d.durationMs ? (d.fileSizeBytes * 8) / (d.durationMs / 1000) / 1e6 : null;
  const spec = [
    v ? (v.codecDescription ?? v.codec) : null,
    v?.bitDepth ? `${v.bitDepth}-bit ${v.chroma ?? ""}`.trim() : null,
    a ? `${a.codec?.toUpperCase() ?? "Audio"} ${a.channelLayout ?? (a.channels ? `${a.channels}ch` : "")}`.trim() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Playback details" className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-room-seam px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="spine text-[22px] text-room-ink">Playback details</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-room-ink-2">{loaded ? spec || "No media loaded" : "Reading from the engine…"}</p>
        </div>
        {props.onClose && (
          <IconButton tone="room" size="sm" label="Close details (I)" onClick={props.onClose}>
            <CloseIcon size={18} />
          </IconButton>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {props.issues.length > 0 && (
          <div className="mb-3 rounded-[8px] border border-room-seam p-3 text-[12.5px] leading-relaxed text-room-ink-2">
            {props.issues.map((i) => (
              <p key={i.kind}>
                <span className="font-[650] text-room-ink">{i.kind === "videoDecoderMissing" ? "Video can't be decoded" : "Audio can't be decoded"}</span> (codec{" "}
                {i.codec}). NOVA's engine has no decoder for it; export the file to H.264, HEVC or ProRes, or use the software that recorded it.
              </p>
            ))}
          </div>
        )}

        {d && (
          <>
            <Block title="File">
              <Row k="Container" v={val(d.container?.split(",")[0])} />
              <Row k="Size" v={d.fileSizeBytes ? `${formatBytes(d.fileSizeBytes)}${bitrate ? ` · ${bitrate.toFixed(1)} Mb/s average` : ""}` : NOT_REPORTED} />
            </Block>
            <Block title="Picture">
              {v ? (
                <>
                  <Row k="Codec" v={val(v.codecDescription ?? v.codec)} />
                  <Row k="Resolution" v={v.width ? `${v.width} × ${v.height}` : NOT_REPORTED} />
                  <Row k="Frame rate" v={v.frameRate ? `${+v.frameRate.toFixed(3)} fps` : NOT_REPORTED} />
                  <Row k="Bit depth" v={v.bitDepth ? `${v.bitDepth}-bit` : NOT_REPORTED} />
                  <Row k="Chroma" v={val(v.chroma)} />
                  <Row k="Alpha" v={v.hasAlpha ? "Yes (shown over black)" : "No"} />
                  <Row k="Dynamic range" v={v.hdr ?? (v.transfer ? "SDR" : NOT_REPORTED)} hint={v.hdr ? "Tone-mapped for this display by the engine." : undefined} />
                  <Row k="Decoding" v={v.hwdec ? `Hardware (${v.hwdec})` : "Software"} hint={v.hwdec ? undefined : "Hardware decoding is off, unavailable for this format, or fell back."} />
                </>
              ) : (
                <Row k="Video" v="None in this file" />
              )}
            </Block>
            <Block title="Sound">
              {a ? (
                <>
                  <Row k="Codec" v={val(a.codecDescription ?? a.codec)} />
                  <Row k="Channels" v={a.channelLayout ? `${a.channelLayout}${a.channels ? ` (${a.channels})` : ""}` : val(a.channels)} />
                  <Row k="Sample rate" v={a.sampleRate ? `${(a.sampleRate / 1000).toFixed(1)} kHz` : NOT_REPORTED} />
                </>
              ) : (
                <Row k="Audio" v="None in this file" />
              )}
            </Block>
            <details className="mt-2 border-t border-room-seam pt-2">
              <summary className="catalog cursor-pointer py-1.5 text-room-ink-3 hover:text-room-ink-2">Advanced</summary>
              <div className="pb-2">
                <Row k="Pixel format" v={val(v?.pixelFormat)} mono />
                <Row k="Matrix" v={val(v?.colorMatrix)} mono />
                <Row k="Primaries" v={val(v?.primaries)} mono />
                <Row k="Transfer" v={val(v?.transfer)} mono />
                <Row k="Video decoder" v={val(v?.decoder)} mono />
                <Row k="Sample format" v={val(a?.sampleFormat)} mono />
                <Row k="Video output" v={props.engine ? `${props.engine.videoOutput ?? "?"} / ${props.engine.gpuContext ?? "?"}` : NOT_REPORTED} mono />
                <Row k="Engine" v={val(props.engine?.mpvVersion)} mono />
                <Row k="FFmpeg" v={val(props.engine?.ffmpegVersion)} mono />
              </div>
            </details>
          </>
        )}
        {loaded && !d && <p className="py-6 text-[13px] text-room-ink-2">Open a file to see what the engine is decoding.</p>}
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-room-seam py-2 first:border-t-0">
      <h3 className="catalog py-1.5 text-room-ink-3">{title}</h3>
      <dl>{children}</dl>
    </div>
  );
}

function Row({ k, v, hint, mono }: { k: string; v: string; hint?: string; mono?: boolean }) {
  const unknown = v === NOT_REPORTED;
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-[3px] text-[13px]">
      <dt className="text-room-ink-3">{k}</dt>
      <dd className={`min-w-0 break-words ${unknown ? "italic text-room-ink-3" : "text-room-ink"} ${mono ? "tabular-nums" : ""}`} title={hint}>
        {v}
        {hint && <span className="block text-[11.5px] not-italic text-room-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}

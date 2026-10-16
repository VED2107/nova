/**
 * The NOVA Media Atlas, built from the repository's compatibility evidence:
 *
 * - docs/compat/results-no.json        software-decoding pass (55 samples)
 * - docs/compat/results-auto_copy.json hardware-decoding pass (same samples)
 * - docs/compat/engine-audit.tsv       decoders and demuxers compiled into libmpv
 * - docs/compat/README.md              the published tiers (ADR 0006 policy)
 *
 * Sample results come straight from the JSON. Tiers that the JSON cannot
 * express (Partial limitations; Expected, External and Unsupported formats with
 * no sample) are transcribed from README.md below, each with the README phrase
 * it rests on. tests/compat.test.ts fails if a phrase disappears from the
 * README, a sample is added without a classification, or a named decoder is
 * missing from the engine audit.
 */
import softRaw from "../../../../docs/compat/results-no.json";
import hwRaw from "../../../../docs/compat/results-auto_copy.json";
import auditRaw from "../../../../docs/compat/engine-audit.tsv?raw";
import readmeRaw from "../../../../docs/compat/README.md?raw";

export type Tier = "verified" | "partial" | "expected" | "external" | "unsupported";

export const TIERS: { id: Tier; label: string; meaning: string }[] = [
  {
    id: "verified",
    label: "Verified",
    meaning:
      "A synthetic sample of this profile played on the real engine in the test harness: playback started, the format was detected correctly, seeking was exact, and no frames were dropped. Not a file from a camera.",
  },
  { id: "partial", label: "Partial", meaning: "Plays, with a documented limitation." },
  {
    id: "expected",
    label: "Expected",
    meaning: "The engine contains the decoder and demuxer, but no representative sample has been tested yet.",
  },
  {
    id: "external",
    label: "Needs vendor SDK",
    meaning:
      "Needs a vendor decoder that NOVA does not ship. NOVA recognises the file and explains the alternatives; it does not decode it.",
  },
  {
    id: "unsupported",
    label: "Unsupported",
    meaning: "Will not play, by design or for legal reasons. Detected and explained where possible.",
  },
];

export type Area =
  | "Delivery"
  | "Camera profile"
  | "Intermediate"
  | "Lossless"
  | "High-end"
  | "Audio"
  | "Still image"
  | "Robustness"
  | "Camera RAW"
  | "Project file"
  | "Protected media";

export const AREAS: Area[] = [
  "Delivery",
  "Camera profile",
  "Intermediate",
  "Lossless",
  "High-end",
  "Audio",
  "Still image",
  "Robustness",
  "Camera RAW",
  "Project file",
  "Protected media",
];

export type Capability = "hdr" | "alpha" | "deep" | "chroma" | "hw";
export const CAPABILITIES: { id: Capability; label: string }[] = [
  { id: "hdr", label: "HDR" },
  { id: "alpha", label: "Alpha" },
  { id: "deep", label: "10-bit or more" },
  { id: "chroma", label: "4:2:2 or 4:4:4" },
  { id: "hw", label: "Hardware decoded" },
];

interface RawVideo {
  codec: string;
  codecDescription: string;
  width: number;
  height: number;
  bitDepth: number | null;
  chroma: string | null;
  hasAlpha: boolean;
  frameRate: number | null;
  hdr: string | null;
  hwdec: string | null;
}
interface RawAudio {
  codec: string;
  codecDescription: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;
}
export interface RawResult {
  id: string;
  file: string;
  category: string;
  expect: string;
  notes: string;
  pass: boolean;
  result: string;
  openToPlayMs: number | null;
  seekErrorMs: number | null;
  decoderDrops: number | null;
  privateMibAfter: number | null;
  details: { container: string; video: RawVideo | null; audio: RawAudio | null } | null;
  issues: { kind?: string }[];
  error: unknown;
}

export const SOFTWARE: RawResult[] = softRaw as RawResult[];
export const HARDWARE: RawResult[] = hwRaw as RawResult[];
export const README = readmeRaw as string;

/** Decoder and demuxer names compiled into the audited libmpv. */
export const ENGINE = (() => {
  // Lines: "decoder\t<codec>\t<decoder name>\t<description>" and "demuxer\t<name>".
  const decoders = new Set<string>();
  const demuxers = new Set<string>();
  let decoderCount = 0;
  for (const line of (auditRaw as string).split(/\r?\n/)) {
    const [kind, codec, name] = line.split("\t");
    if (kind === "decoder") {
      decoderCount++;
      decoders.add(codec);
      decoders.add(name);
    } else if (kind === "demuxer") demuxers.add(codec);
  }
  const mpv = (auditRaw as string).match(/^# mpv Some\("(.+?)"\)/m)?.[1] ?? "";
  const ffmpeg = (auditRaw as string).match(/^# ffmpeg Some\("(.+?)"\)/m)?.[1] ?? "";
  return { decoders, demuxers, decoderCount, demuxerCount: demuxers.size, mpv, ffmpeg };
})();

export interface PassResult {
  ok: boolean;
  result: string;
  openToPlayMs: number | null;
  seekErrorMs: number | null;
  drops: number | null;
  memoryMib: number | null;
  /** Hardware decoder actually used (e.g. "d3d11va"), or null when the engine decoded in software. */
  hwdec: string | null;
}

export interface AtlasEntry {
  id: string;
  /** Catalogue number, assigned in display order. */
  no: string;
  name: string;
  tier: Tier;
  area: Area;
  /** File extensions this entry covers, lower case with the dot. */
  extensions: string[];
  /** One line: codec, size, depth, chroma… */
  spec: string;
  caps: Capability[];
  /** What the evidence is. */
  evidence: string;
  limitation?: string;
  sample?: { file: string; expect: string; software: PassResult; hardware: PassResult; audioOnly: boolean };
  /** Engine decoders named for this entry and whether the audit lists them. */
  decoders?: { name: string; present: boolean }[];
  /** Section of docs/compat/README.md this rests on. */
  source: string;
}

// --- Classification of the 55 harness samples -------------------------------

const AREA_BY_CATEGORY: Record<string, Area> = {
  consumer: "Delivery",
  legacy: "Delivery",
  broadcast: "Delivery",
  "camera-profile": "Camera profile",
  intermediate: "Intermediate",
  realtime: "Intermediate",
  archival: "Lossless",
  uncompressed: "Lossless",
  hdr: "High-end",
  "high-res": "High-end",
  hfr: "High-end",
  vfr: "High-end",
  audio: "Audio",
  image: "Still image",
  failure: "Robustness",
  detection: "Robustness",
  project: "Project file",
  "raw-standin": "Camera RAW",
};
const AREA_BY_ID: Record<string, Area> = { vp9_alpha: "Delivery", qtrle_alpha: "Lossless" };

/** Partial tier, from README "### Partial". `phrase` must appear in the README. */
export const PARTIAL: Record<string, { limitation: string; phrase: string }> = {
  vp9_alpha: {
    limitation: "Plays, but the engine's native VP9 decoder drops the alpha plane (output yuv420p).",
    phrase: "VP9 with alpha",
  },
  prores_4444: {
    limitation: "Alpha is decoded and reported, but shown over black: no checkerboard or compositing. Display not verified.",
    phrase: "Alpha video in general",
  },
  qtrle_alpha: {
    limitation: "Alpha is decoded and reported, but shown over black: no checkerboard or compositing. Display not verified.",
    phrase: "Alpha video in general",
  },
  hevc_8k: {
    limitation: "Plays. In software it uses about 1.27 GB of private memory; real-time speed was not measured because the 2 s sample is too short.",
    phrase: "8K HEVC in software",
  },
  hevc_hdr10: {
    limitation: "HDR10 metadata is detected. Tone mapping to SDR and output on an HDR display have not been checked by eye.",
    phrase: "HDR10 / HLG",
  },
  hevc_hlg: {
    limitation: "HLG is detected. Tone mapping to SDR and output on an HDR display have not been checked by eye.",
    phrase: "HDR10 / HLG",
  },
  dpx_frame: {
    limitation: "A single frame displays. Image sequences are not supported yet.",
    phrase: "Image sequences are not supported yet",
  },
  exr_frame: {
    limitation: "A single frame displays. Image sequences are not supported yet.",
    phrase: "Image sequences are not supported yet",
  },
};

/** Readable names for samples; the JSON notes are written for engineers. */
const NAMES: Record<string, string> = {
  h264_aac: "H.264 High in MP4",
  hevc_hdr10: "HEVC Main10 HDR10",
  hevc_hlg: "HEVC Main10 HLG",
  hevc_422_10: "HEVC 4:2:2 10-bit (XAVC HS-style)",
  av1_10bit: "AV1 10-bit in Matroska",
  vp9_alpha: "VP9 with alpha in WebM",
  vp8: "VP8 in WebM",
  mpeg4_asp: "MPEG-4 Part 2 ASP in AVI",
  theora: "Theora in Ogg",
  h264_3gp: "H.264 in 3GP",
  mpeg2_vob: "MPEG-2 in VOB (DVD-style)",
  mpeg2_ts: "MPEG-2 in MPEG-TS (broadcast)",
  avchd_m2ts: "H.264 in M2TS (AVCHD-style)",
  vfr: "Variable frame rate",
  hfr_120: "1080p at 120 fps",
  xavc_i_like: "H.264 4:2:2 Intra 10-bit in MXF (XAVC-I / XF-AVC Intra profile)",
  avc_intra100: "AVC-Intra 100 class in MXF",
  xdcam_hd422: "MPEG-2 4:2:2 50 Mb/s in MXF (XDCAM HD422 profile)",
  dv: "DV PAL",
  mjpeg: "Motion JPEG in AVI",
  prores_422hq: "Apple ProRes 422 HQ",
  prores_4444: "Apple ProRes 4444 with alpha",
  dnxhr_hqx: "Avid DNxHR HQX 10-bit in MXF",
  dnxhd_36: "Avid DNxHD 36 in MOV",
  cineform: "GoPro CineForm",
  ffv1: "FFV1 10-bit (archival)",
  huffyuv: "HuffYUV",
  utvideo: "Ut Video",
  v210: "Uncompressed 10-bit 4:2:2 (v210)",
  qtrle_alpha: "QuickTime Animation with alpha",
  hap: "HAP",
  hevc_4k60: "4K60 HEVC Main10",
  hevc_8k: "8K24 HEVC",
  prores_4k: "4K ProRes 422 HQ",
  wav_51: "24-bit PCM 5.1 in WAV",
  flac_71: "FLAC 7.1",
  alac: "Apple Lossless (ALAC)",
  ac3_51: "Dolby Digital (AC-3) 5.1",
  eac3_51: "Dolby Digital Plus (E-AC-3) 5.1",
  dts_51: "DTS core 5.1",
  truehd: "Dolby TrueHD 5.1",
  opus: "Opus",
  mp3: "MP3",
  dpx_frame: "DPX 10-bit frame",
  exr_frame: "OpenEXR float frame",
  unknown_fourcc: "Unknown video codec in a playable file",
  truncated: "Truncated MOV",
  midcorrupt: "Corruption mid-stream",
  zero: "Zero-byte file",
  random: "Random bytes with a media extension",
  prproj: "Premiere Pro project",
  fcpxml: "Final Cut Pro XML",
  renamed: "Matroska named .mp4",
  braw_standin: "Blackmagic RAW (.braw)",
  r3d_standin: "RED R3D",
};

/** What a robustness/detection sample demonstrates, in the visitor's words. */
const BEHAVIOUR: Record<string, string> = {
  unknown_fourcc: "The sound keeps playing and a banner explains that the picture can't be decoded.",
  truncated: "A clear error instead of a hang.",
  midcorrupt: "Playback continues past the damage; no hang.",
  zero: "A clear error that names the file.",
  random: "A clear error that names the file.",
  prproj: "Recognised as an editing project and explained instead of failing.",
  fcpxml: "Recognised as an editing timeline and explained instead of failing.",
  renamed: "File contents decide the format, not the extension: it plays.",
  braw_standin: "Recognised; NOVA explains that the Blackmagic RAW SDK is needed and how to export.",
  r3d_standin: "Recognised; NOVA explains that the RED R3D SDK is needed and how to export.",
};

function tierForSample(r: RawResult): Tier {
  if (PARTIAL[r.id]) return "partial";
  if (r.expect === "editing-project") return "unsupported";
  if (r.expect === "requires-external") return "external";
  return "verified";
}

function pass(r: RawResult | undefined): PassResult {
  const v = r?.details?.video ?? null;
  return {
    ok: !!r?.pass,
    result: r?.result ?? "missing",
    openToPlayMs: r?.openToPlayMs ?? null,
    seekErrorMs: r?.seekErrorMs ?? null,
    drops: r?.decoderDrops ?? null,
    memoryMib: r?.privateMibAfter ?? null,
    hwdec: v?.hwdec ? v.hwdec.replace(/-copy$/, "") : null,
  };
}

const ext = (file: string) => file.slice(file.lastIndexOf(".")).toLowerCase();

function specLine(r: RawResult): string {
  const v = r.details?.video;
  const a = r.details?.audio;
  const parts: string[] = [];
  if (v) {
    parts.push(v.codec, `${v.width}×${v.height}`);
    if (v.bitDepth) parts.push(`${v.bitDepth}-bit`);
    if (v.chroma) parts.push(v.chroma);
    if (v.hasAlpha) parts.push("alpha");
    if (v.hdr) parts.push(v.hdr);
  }
  if (a) parts.push(`${a.codec} ${a.channelLayout || `${a.channels} ch`}`);
  if (!v && !a) parts.push(r.result === "rejected" ? "not media" : "no decodable streams");
  return parts.join(" · ");
}

function capsFor(r: RawResult, hw: PassResult): Capability[] {
  const v = r.details?.video;
  const caps: Capability[] = [];
  if (!v) return caps;
  if (v.hdr) caps.push("hdr");
  if (v.hasAlpha || r.id === "vp9_alpha") caps.push("alpha");
  if ((v.bitDepth ?? 0) >= 10) caps.push("deep");
  if (v.chroma === "4:2:2" || v.chroma === "4:4:4") caps.push("chroma");
  if (hw.hwdec) caps.push("hw");
  return caps;
}

function fromSample(r: RawResult): Omit<AtlasEntry, "no"> {
  const hwRow = HARDWARE.find((h) => h.id === r.id);
  const software = pass(r);
  const hardware = pass(hwRow);
  const tier = tierForSample(r);
  const audioOnly = !r.details?.video && !!r.details?.audio;
  const behaviour = BEHAVIOUR[r.id];
  return {
    id: r.id,
    name: NAMES[r.id] ?? r.notes,
    tier,
    area: AREA_BY_ID[r.id] ?? AREA_BY_CATEGORY[r.category] ?? "Delivery",
    extensions: [ext(r.file)],
    spec: specLine(r),
    caps: capsFor(r, hardware),
    evidence: behaviour
      ? `Harness sample \`${r.file}\`. ${behaviour}`
      : `Synthetic harness sample \`${r.file}\` (${r.notes}).`,
    limitation: PARTIAL[r.id]?.limitation,
    sample: { file: r.file, expect: r.expect, software, hardware, audioOnly },
    source:
      tier === "partial"
        ? "partial"
        : tier === "external"
          ? "requires-external-component-detected-not-decoded"
          : tier === "unsupported"
            ? "unsupported-by-design-or-law"
            : "verified-synthetic-profile-samples-software-and-hardware-passes",
  };
}

// --- Formats with no harness sample (from README) ---------------------------

export interface DocEntry {
  id: string;
  name: string;
  tier: Tier;
  area: Area;
  extensions: string[];
  spec: string;
  caps?: Capability[];
  evidence: string;
  limitation?: string;
  decoders?: string[];
  source: string;
  /** Text that must appear in README.md for this entry to stay published. */
  phrase: string;
}

const EXPECTED_EVIDENCE = "Decoder present in the engine audit. No representative sample has been tested.";
const CAMERA_EVIDENCE =
  "The codec profile is Verified with a synthetic sample. Real camera files have not been tested: their container quirks, metadata and timecode tracks may differ.";

export const DOC_ENTRIES: DocEntry[] = [
  { id: "prores_raw", name: "ProRes RAW", tier: "expected", area: "Camera RAW", extensions: [".mov"], spec: "prores_raw", evidence: "Decoder present in the engine audit. No sample exists: there is no open encoder to make one.", decoders: ["prores_raw"], source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "ProRes RAW" },
  { id: "sony_real", name: "Sony XAVC-S, XAVC-I, XAVC-HS camera files", tier: "expected", area: "Camera profile", extensions: [".mp4", ".mxf"], spec: "h264 / hevc · real camera files", evidence: CAMERA_EVIDENCE, source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "Sony XAVC-S, XAVC-I, XAVC-HS" },
  { id: "canon_real", name: "Canon XF-AVC and XF-HEVC camera files", tier: "expected", area: "Camera profile", extensions: [".mxf", ".mp4"], spec: "h264 / hevc · real camera files", evidence: CAMERA_EVIDENCE, source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "Canon XF-AVC, XF-HEVC" },
  { id: "panasonic_real", name: "Panasonic AVC-Intra, AVC-Ultra, AVCHD camera files", tier: "expected", area: "Camera profile", extensions: [".mxf", ".mts", ".m2ts"], spec: "h264 · real camera files", evidence: CAMERA_EVIDENCE, source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "Panasonic AVC-Intra, AVC-Ultra, AVCHD" },
  { id: "gopro_dji", name: "GoPro and DJI camera files", tier: "expected", area: "Camera profile", extensions: [".mp4", ".mov"], spec: "hevc / h264 · real camera files", evidence: CAMERA_EVIDENCE, source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "GoPro and DJI HEVC/H.264" },
  { id: "iphone", name: "iPhone ProRes and HEVC recordings", tier: "expected", area: "Camera profile", extensions: [".mov"], spec: "prores / hevc · real camera files", evidence: CAMERA_EVIDENCE, source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "iPhone ProRes and HEVC" },
  { id: "vvc", name: "VVC / H.266", tier: "expected", area: "Delivery", extensions: [".mp4", ".mkv", ".266"], spec: "vvc", evidence: EXPECTED_EVIDENCE, decoders: ["vvc"], source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "VVC/H.266" },
  { id: "vc1", name: "VC-1 / WMV", tier: "expected", area: "Delivery", extensions: [".wmv", ".asf", ".mkv"], spec: "vc1 · wmv3", evidence: EXPECTED_EVIDENCE, decoders: ["vc1", "wmv3"], source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "VC-1/WMV" },
  { id: "jpeg2000", name: "JPEG 2000 (unencrypted)", tier: "expected", area: "Intermediate", extensions: [".mxf", ".j2k", ".jp2"], spec: "jpeg2000", evidence: EXPECTED_EVIDENCE, decoders: ["jpeg2000"], source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "JPEG 2000 (unencrypted)" },
  { id: "dtshd_atmos", name: "DTS-HD MA and TrueHD Atmos", tier: "expected", area: "Audio", extensions: [".mkv", ".mka", ".dts", ".thd", ".m2ts"], spec: "dts · truehd · core and lossless decode", evidence: "Decoders present. Core and lossless decode are expected; object rendering (Atmos, DTS:X) is not available.", decoders: ["dts", "truehd"], source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "DTS-HD MA and TrueHD Atmos" },
  { id: "dolby_vision", name: "Dolby Vision profiles 5 and 8", tier: "expected", area: "High-end", extensions: [".mp4", ".mkv"], spec: "hevc · Dolby Vision", caps: ["hdr", "deep"], evidence: "Handled by libplacebo inside mpv. No sample has been tested.", source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "Dolby Vision profiles 5/8" },
  { id: "gxf", name: "GXF (broadcast)", tier: "expected", area: "Delivery", extensions: [".gxf"], spec: "gxf container", evidence: "Demuxer present in the engine audit. No sample has been tested.", source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "GXF" },
  { id: "interlaced", name: "Interlaced broadcast material", tier: "expected", area: "Delivery", extensions: [".ts", ".mxf", ".m2ts"], spec: "interlaced", evidence: "Decodes; deinterlacing is not configured by default yet (it can be switched on in the player).", source: "expected-decoder-present-in-the-audit-no-sample-tested", phrase: "interlaced broadcast material" },
  { id: "arriraw", name: "ARRIRAW", tier: "external", area: "Camera RAW", extensions: [".ari", ".arx"], spec: "needs ARRI SDK", evidence: "Recognised by extension; NOVA explains that ARRI's software is needed. No real file tested.", source: "requires-external-component-detected-not-decoded", phrase: "ARRIRAW" },
  { id: "canon_raw", name: "Canon Cinema RAW Light", tier: "external", area: "Camera RAW", extensions: [".crm"], spec: "needs Canon RAW SDK", evidence: "Recognised by extension; NOVA explains that Canon's software is needed. No real file tested.", source: "requires-external-component-detected-not-decoded", phrase: "Canon Cinema RAW Light" },
  { id: "sony_raw", name: "Sony X-OCN / Sony RAW", tier: "external", area: "Camera RAW", extensions: [".mxf"], spec: "needs Sony SDK · inside MXF", evidence: "Not detectable by extension because it is ordinary MXF on the outside. Reported as a video codec that can't be decoded, with export guidance.", source: "requires-external-component-detected-not-decoded", phrase: "Sony X-OCN / Sony RAW" },
  { id: "other_projects", name: "Other editing projects", tier: "unsupported", area: "Project file", extensions: [".aep", ".drp", ".veg", ".kdenlive", ".mlt", ".otio", ".aaf", ".avp", ".edl"], spec: "not media", evidence: "Projects are not media. After Effects, Resolve, Vegas, Kdenlive, MLT, OTIO, AAF, Avid and EDL files are detected and explained.", source: "unsupported-by-design-or-law", phrase: ".kdenlive" },
  { id: "drm", name: "DRM-protected media", tier: "unsupported", area: "Protected media", extensions: [".m4v", ".ism", ".mxf"], spec: "FairPlay · Widevine · encrypted DCP · AACS/CSS", evidence: "Out of scope, by design and law.", source: "unsupported-by-design-or-law", phrase: "DRM-protected media" },
  { id: "cinemadng", name: "CinemaDNG sequences", tier: "unsupported", area: "Camera RAW", extensions: [".dng"], spec: "image sequence", evidence: "Not supported today. Image-sequence playback is planned (gap analysis, P1).", source: "unsupported-by-design-or-law", phrase: "CinemaDNG sequences" },
];

// --- Containers: a recognised extension is not a promise ---------------------

export const CONTAINERS: Record<string, string> = {
  ".mxf": "MXF is a container. NOVA plays the MXF profiles that were tested (XAVC-I-style, AVC-Intra, XDCAM HD422, DNxHR), but an MXF can also hold Sony X-OCN RAW or JPEG 2000, which are not the same promise.",
  ".mov": "MOV is a container. It can hold H.264, HEVC, ProRes, DNxHD, CineForm, HAP, Animation and more; ProRes RAW in MOV is untested.",
  ".mp4": "MP4 is a container. NOVA decides by contents: H.264, HEVC and AV1 inside are tested; a misnamed Matroska file still plays.",
  ".mkv": "Matroska is a container that can hold almost any codec. The codec inside decides what plays.",
  ".avi": "AVI is a container. Tested: MPEG-4 ASP, Motion JPEG, HuffYUV, Ut Video. An unknown codec inside plays sound only, with an explanation.",
  ".m2ts": "M2TS is a transport stream. AVCHD-style H.264 is tested; real camera files are not.",
  ".mts": "MTS is a transport stream used by AVCHD cameras. The profile is tested, real camera files are not.",
  ".ts": "MPEG-TS is a broadcast container. MPEG-2 is tested; interlaced material is not deinterlaced by default yet.",
  ".webm": "WebM holds VP8, VP9 or AV1. VP9 alpha plays without its alpha plane.",
  ".r3d": "R3D needs RED's decoder, which NOVA does not ship.",
  ".braw": "BRAW needs Blackmagic's decoder, which NOVA does not ship.",
};

// --- Build ------------------------------------------------------------------

const TIER_ORDER: Tier[] = ["verified", "partial", "expected", "external", "unsupported"];

export function buildAtlas(): AtlasEntry[] {
  const fromJson = SOFTWARE.map(fromSample);
  const fromDocs: Omit<AtlasEntry, "no">[] = DOC_ENTRIES.map(({ phrase: _phrase, decoders, caps, ...e }) => ({
    ...e,
    caps: caps ?? [],
    decoders: decoders?.map((name) => ({ name, present: ENGINE.decoders.has(name) })),
  }));
  const all = [...fromJson, ...fromDocs].sort(
    (a, b) =>
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      AREAS.indexOf(a.area) - AREAS.indexOf(b.area),
  );
  return all.map((e, i) => ({ ...e, no: String(i + 1).padStart(3, "0") }));
}

export const ATLAS = buildAtlas();

export const SUMMARY = {
  samples: SOFTWARE.length,
  softwareMet: SOFTWARE.filter((r) => r.pass).length,
  hardwareMet: HARDWARE.filter((r) => r.pass).length,
  hardwareDecoded: HARDWARE.filter((r) => r.details?.video?.hwdec).length,
  decoders: ENGINE.decoderCount,
  demuxers: ENGINE.demuxerCount,
  byTier: Object.fromEntries(TIER_ORDER.map((t) => [t, ATLAS.filter((e) => e.tier === t).length])) as Record<Tier, number>,
  engine: { mpv: ENGINE.mpv, ffmpeg: ENGINE.ffmpeg },
};

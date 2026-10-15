import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, CloseIcon, SearchIcon } from "../../components/icons";
import { Button, Kbd, Segmented, Switch } from "../../components/ui/controls";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { library } from "../../services/library/client";
import { ACTIONS, ACTION_BY_ID, chordLabel, chordOf, conflicts, effectiveKeymap, parseKeymap, type ActionGroup, type Keymap } from "../../services/playback/actions";
import { engineInfo, type EngineInfo } from "../../services/playback/client";
import { setPref, usePrefs, type Prefs } from "../../services/prefs";
import { bind, resetAction, unbind } from "./keymapEdit";

type Section = "appearance" | "playback" | "controls" | "privacy" | "formats" | "about";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "playback", label: "Playback" },
  { id: "controls", label: "Keys & mouse" },
  { id: "privacy", label: "Library & privacy" },
  { id: "formats", label: "Formats" },
  { id: "about", label: "About" },
];

export function SettingsDialog(props: { open: boolean; onClose: () => void; initialSection?: Section }) {
  const [section, setSection] = useState<Section>(props.initialSection ?? "appearance");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const prefs = usePrefs();
  const firstPrefs = useRef(true);
  useEffect(() => {
    if (props.open && props.initialSection) setSection(props.initialSection);
  }, [props.open, props.initialSection]);
  // Preferences only change after Rust has stored them, so a change here means "saved".
  useEffect(() => {
    if (firstPrefs.current) {
      firstPrefs.current = false;
      return;
    }
    if (!props.open) return;
    setError(null);
    setSaved(true);
    const t = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [prefs]);

  return (
    <Dialog open={props.open} onClose={props.onClose} title="Settings" width="min(860px, calc(100vw - 48px))">
      <div className="flex min-h-[520px]">
        <nav aria-label="Settings sections" className="flex w-[190px] shrink-0 flex-col border-r border-seam bg-paper-sunk/50 p-2 pb-4">
          <p role="status" aria-live="polite" className="sr-only">
            {saved ? "Saved" : ""}
          </p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => setSection(s.id)}
              className={`flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[13.5px] font-[560] ${
                section === s.id ? "bg-paper text-ink shadow-[inset_0_0_0_1px_var(--seam-strong)]" : "text-ink-2 hover:bg-[var(--hover)]"
              }`}
            >
              {section === s.id && <span aria-hidden className="size-1.5 rounded-full bg-ember" />}
              {s.label}
            </button>
          ))}
          <p aria-hidden className={`mt-4 flex items-center gap-1.5 px-3 text-[12px] text-ink-3 transition-opacity duration-200 ${saved ? "opacity-100" : "opacity-0"}`}>
            <CheckIcon size={14} className="text-ember-text" /> Saved
          </p>
          <p className="mt-1 px-3 text-[11.5px] leading-snug text-ink-3">Changes save as you make them.</p>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p role="alert" className="mb-3 rounded-[8px] border border-seam-strong px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          {section === "appearance" && <Appearance onError={setError} />}
          {section === "playback" && <Playback onError={setError} />}
          {section === "controls" && <Controls onError={setError} />}
          {section === "privacy" && <Privacy onError={setError} />}
          {section === "formats" && <Formats />}
          {section === "about" && <About />}
        </div>
      </div>
    </Dialog>
  );
}

function useSet(onError: (e: string) => void) {
  return <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPref(k, v).catch((e) => onError(String(e)));
}

function Field(props: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-seam px-3 py-3.5">
      <div>
        <p className="text-[14px] font-[560] text-ink">{props.label}</p>
        {props.description && <p className="mt-0.5 max-w-md text-[12.5px] leading-snug text-ink-3">{props.description}</p>}
      </div>
      {props.children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="spine mb-2 px-3 text-[24px] text-ink">{children}</h3>;
}

function Appearance({ onError }: { onError: (e: string) => void }) {
  const p = usePrefs();
  const set = useSet(onError);
  return (
    <section>
      <Heading>Appearance</Heading>
      <Field label="Theme" description="Home, Library and Settings. The player is always dark.">
        <Segmented label="Theme" value={p.theme} onChange={(v) => set("theme", v)} options={[{ value: "system", label: "System" }, { value: "light", label: "Daylight" }, { value: "dark", label: "Night" }]} />
      </Field>
      <Field label="Player controls" description="Compact gives the picture more room.">
        <Segmented label="Player controls" value={p.controls} onChange={(v) => set("controls", v)} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      </Field>
      <div className="border-b border-seam">
        <Switch label="Hide controls while playing" description="Controls fade after 2.5 seconds without mouse movement." checked={p.autoHide === "on"} onChange={(v) => set("autoHide", v ? "on" : "off")} />
      </div>
    </section>
  );
}

function Playback({ onError }: { onError: (e: string) => void }) {
  const p = usePrefs();
  const set = useSet(onError);
  return (
    <section>
      <Heading>Playback</Heading>
      <div className="border-b border-seam">
        <Switch
          label="Hardware decoding"
          description="Uses the graphics card when it supports the format and falls back to software automatically. Turn off if you see artefacts."
          checked={p.hwdec === "auto"}
          onChange={(v) => set("hwdec", v ? "auto" : "off")}
        />
      </div>
      <div className="border-b border-seam">
        <Switch label="Resume where you left off" description="Positions are still remembered when off; files simply start from the beginning." checked={p.resume === "on"} onChange={(v) => set("resume", v ? "on" : "off")} />
      </div>
      <Field label="Time display" description="Also toggled by clicking the time in the player.">
        <Segmented label="Time display" value={p.timeDisplay} onChange={(v) => set("timeDisplay", v)} options={[{ value: "elapsed", label: "Elapsed" }, { value: "remaining", label: "Remaining" }]} />
      </Field>
    </section>
  );
}

const GROUPS: ActionGroup[] = ["Playback", "Navigation", "Audio", "Subtitles", "Video", "Queue", "View"];

function Controls({ onError }: { onError: (e: string) => void }) {
  const p = usePrefs();
  const set = useSet(onError);
  const overrides = useMemo(() => parseKeymap(p.keymap), [p.keymap]);
  const map = useMemo(() => effectiveKeymap(overrides), [overrides]);
  const clashes = useMemo(() => conflicts(map), [map]);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [pending, setPending] = useState<{ action: string; chord: string; owner: string } | null>(null);
  const [resetAll, setResetAll] = useState(false);
  const [find, setFind] = useState("");
  const needle = find.trim().toLowerCase();
  const matches = (a: (typeof ACTIONS)[number]) =>
    !needle || a.label.toLowerCase().includes(needle) || map[a.id]!.some((c) => chordLabel(c).toLowerCase().includes(needle));
  const shown = ACTIONS.filter(matches);

  const save = (next: Keymap) => set("keymap", JSON.stringify(next));

  // Capture the next chord while editing. Esc cancels; modifier-only presses are ignored.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setCapturing(null);
        return;
      }
      const chord = chordOf(e);
      if (!chord) return;
      const r = bind(overrides, capturing, chord, false);
      if (!r.ok) setPending({ action: capturing, chord, owner: r.conflictWith });
      else void save(r.map);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, overrides]);

  return (
    <section>
      <Heading>Mouse</Heading>
      <Field label="Scroll wheel over the picture" description="Over the timeline the wheel always seeks; Shift+wheel seeks anywhere.">
        <Segmented label="Scroll wheel" value={p.wheel} onChange={(v) => set("wheel", v)} options={[{ value: "volume", label: "Volume" }, { value: "seek", label: "Seek" }, { value: "none", label: "Nothing" }]} />
      </Field>
      <Field label="Click on the picture">
        <Segmented label="Click" value={p.click} onChange={(v) => set("click", v)} options={[{ value: "pause", label: "Play / pause" }, { value: "none", label: "Nothing" }]} />
      </Field>
      <Field label="Double-click on the picture">
        <Segmented label="Double-click" value={p.dblclick} onChange={(v) => set("dblclick", v)} options={[{ value: "fullscreen", label: "Fullscreen" }, { value: "none", label: "Nothing" }]} />
      </Field>
      <p className="border-b border-seam px-3 py-3 text-[12.5px] leading-relaxed text-ink-3">
        Right-click opens the full player menu. Mouse back/forward buttons go to the previous/next title in the queue.
      </p>

      <div className="mt-8 flex items-end justify-between px-3">
        <h3 className="spine text-[24px] text-ink">Keyboard</h3>
        <Button variant="ghost" onClick={() => setResetAll(true)} disabled={Object.keys(overrides).length === 0}>
          Restore all defaults
        </Button>
      </div>
      {clashes.size > 0 && (
        <p role="alert" className="mx-3 mt-2 rounded-[8px] border border-seam-strong px-3 py-2 text-[13px] text-danger">
          {[...clashes].map(([c, ids]) => `${chordLabel(c)} is bound to ${ids.map((i) => ACTION_BY_ID.get(i)?.label).join(" and ")}`).join(". ")}. Only the first runs; change one of them.
        </p>
      )}
      {capturing && (
        <p role="status" className="mx-3 mt-2 rounded-[8px] bg-paper-sunk px-3 py-2 text-[13px] text-ink">
          Press the new key combination for <strong>{ACTION_BY_ID.get(capturing)?.label}</strong>, or Esc to cancel.
        </p>
      )}
      <label className="relative mx-3 mt-3 block">
        <span className="sr-only">Find an action or key</span>
        <SearchIcon size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Find an action or a key, e.g. “subtitle” or “Shift+S”"
          className="h-9 w-full rounded-[8px] border border-seam-strong bg-paper-raised pl-8 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:shadow-[0_0_0_3px_rgb(249_115_22/0.22)] focus-visible:outline-none"
        />
      </label>
      {shown.length === 0 && <p className="px-3 py-4 text-[13px] text-ink-3">No action or key matches “{find.trim()}”.</p>}
      {GROUPS.filter((g) => shown.some((a) => a.group === g)).map((g) => (
        <div key={g} className="mt-4">
          <h4 className="catalog px-3 pb-1 text-ink-3">{g}</h4>
          <ul className="border-t border-seam">
            {shown.filter((a) => a.group === g).map((a) => {
              const chords = map[a.id]!;
              const custom = a.id in overrides;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-seam px-3 py-2">
                  <span className="min-w-[200px] flex-1 text-[13.5px] text-ink">
                    {a.label}
                    {custom && <span className="ml-2 text-[11.5px] text-ember-text">custom</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {chords.length === 0 && <span className="text-[12.5px] italic text-ink-3">No key</span>}
                    {chords.map((c) => (
                      <span key={c} className="inline-flex items-center">
                        <Kbd>{chordLabel(c)}</Kbd>
                        <button
                          type="button"
                          aria-label={`Remove ${chordLabel(c)} from ${a.label}`}
                          onClick={() => void save(unbind(overrides, a.id, c))}
                          className="ml-0.5 rounded-[4px] p-0.5 text-ink-3 hover:bg-[var(--hover)] hover:text-ink"
                        >
                          <CloseIcon size={12} />
                        </button>
                      </span>
                    ))}
                  </span>
                  <Button variant="ghost" className="h-7 px-2 text-[12.5px]" onClick={() => setCapturing(a.id)} aria-label={`Add a key for ${a.label}`}>
                    Add key
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-[12.5px]"
                    disabled={!custom}
                    onClick={() => {
                      const r = resetAction(overrides, a.id);
                      if (!r.ok) onError(`Can't restore ${a.label}: its default key is now used by ${ACTION_BY_ID.get(r.conflictWith)?.label}.`);
                      else void save(r.map);
                    }}
                  >
                    Reset
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <ConfirmDialog
        open={pending != null}
        title="Key already in use"
        body={
          pending && (
            <>
              <Kbd>{chordLabel(pending.chord)}</Kbd> is assigned to <strong>{ACTION_BY_ID.get(pending.owner)?.label}</strong>. Move it to{" "}
              <strong>{ACTION_BY_ID.get(pending.action)?.label}</strong>? {ACTION_BY_ID.get(pending.owner)?.label} loses this key.
            </>
          )
        }
        confirmLabel="Move key"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const r = bind(overrides, pending.action, pending.chord, true);
            if (r.ok) void save(r.map);
          }
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={resetAll}
        title="Restore all default keys?"
        body="Every custom key binding is removed. Mouse settings are not changed."
        confirmLabel="Restore defaults"
        onCancel={() => setResetAll(false)}
        onConfirm={() => {
          setResetAll(false);
          void save({});
        }}
      />
    </section>
  );
}

function Privacy({ onError }: { onError: (e: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <section>
      <Heading>Library & privacy</Heading>
      <div className="space-y-2 px-3 text-[13.5px] leading-relaxed text-ink-2">
        <p>NOVA works offline. It has no account, sends no telemetry, and never uploads file names, paths or viewing history.</p>
        <p>The library, watch progress and settings are stored in a local database in your user profile. Thumbnails are generated on this computer.</p>
      </div>
      <Field label="Watch history" description="Clears Continue Watching and every resume position. Files and the library are not touched.">
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Clear history
        </Button>
      </Field>
      {done && (
        <p role="status" className="px-3 py-2 text-[13px] text-ink-2">
          {done}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        title="Clear watch history?"
        body="Continue Watching and all resume positions are removed. This can't be undone."
        confirmLabel="Clear history"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          library.clearHistory().then((n) => setDone(`Cleared ${n} ${n === 1 ? "entry" : "entries"}.`), (e) => onError(String(e)));
        }}
      />
    </section>
  );
}

/** Mirrors docs/compat/README.md. Keep the two in step; claim nothing the harness has not shown. */
const FORMAT_GROUPS: { status: string; tone: string; meaning: string; items: string[] }[] = [
  {
    status: "Verified",
    tone: "text-ink",
    meaning: "A sample of the profile played on this engine in NOVA's test harness. Samples are synthetic encodes, not camera files.",
    items: [
      "H.264, HEVC Main/Main10, AV1, VP8, VP9, MPEG-2, MPEG-4 ASP, Theora — in MP4, MOV, MKV, WebM, AVI, TS/M2TS, VOB, OGV, 3GP",
      "Camera-style profiles: XAVC-I / AVC-Intra / XDCAM HD422 in MXF, HEVC 4:2:2 10-bit, DV, Motion JPEG",
      "ProRes 422 HQ and 4444, DNxHR/DNxHD, CineForm, HAP, FFV1, HuffYUV, Ut Video, v210",
      "Audio: AAC, MP3, Opus, Vorbis, FLAC, ALAC, PCM, AC-3, E-AC-3, DTS core, TrueHD",
    ],
  },
  {
    status: "Partial",
    tone: "text-ember-text",
    meaning: "Plays, with a known limitation.",
    items: [
      "HDR10 and HLG: detected and reported; tone mapping and HDR output not yet checked by eye",
      "Video with alpha is shown over black; VP9 alpha is dropped",
      "Single DPX/EXR frames open; image sequences do not yet",
    ],
  },
  {
    status: "Expected",
    tone: "text-ink-2",
    meaning: "The engine has the decoder, but no sample has been tested yet.",
    items: [
      "Real files from Sony, Canon, Panasonic, GoPro, DJI and iPhone cameras (their codec profiles are verified above)",
      "ProRes RAW, VVC/H.266, VC-1/WMV, JPEG 2000, Dolby Vision 5/8, DTS-HD MA, TrueHD Atmos (no object rendering)",
    ],
  },
  {
    status: "Needs the camera maker's software",
    tone: "text-ink-2",
    meaning: "NOVA recognises the file and explains your options, but does not decode it. No real RAW file has been tested.",
    items: [
      "RED R3D, Blackmagic RAW, ARRIRAW, Canon Cinema RAW Light",
      "Sony X-OCN / RAW looks like ordinary MXF, so it is reported as an undecodable video codec instead",
    ],
  },
  {
    status: "Not supported",
    tone: "text-danger",
    meaning: "Will not play.",
    items: [
      "DRM-protected media (streaming downloads, encrypted DCPs, protected discs)",
      "Editing projects (Premiere, After Effects, Resolve, Final Cut…) — NOVA explains they are projects, not media",
      "CinemaDNG and other image sequences (planned)",
    ],
  },
];

function Formats() {
  return (
    <section>
      <Heading>Formats</Heading>
      <p className="mb-4 max-w-xl px-3 text-[13px] leading-relaxed text-ink-3">
        What this build has actually been tested with. Files from real cameras vary; if something won't play, the player tells you why and what to try.
      </p>
      <div className="divide-y divide-seam border-y border-seam">
        {FORMAT_GROUPS.map((g) => (
          <div key={g.status} className="grid grid-cols-[minmax(130px,170px)_1fr] gap-4 px-3 py-3.5">
            <div>
              <p className={`text-[13.5px] font-[650] ${g.tone}`}>{g.status}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{g.meaning}</p>
            </div>
            <ul className="space-y-1 text-[13px] leading-snug text-ink">
              {g.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 px-3 text-[12px] text-ink-3">Hardware decoding depends on your graphics card and driver. NOVA falls back to software when the card can't decode a format.</p>
    </section>
  );
}

function About() {
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  useEffect(() => {
    engineInfo().then(setEngine, () => setEngine(null));
  }, []);
  return (
    <section className="px-3">
      <h3 className="spine-xl text-[44px] text-ink">NOVA</h3>
      <p className="text-[13px] text-ink-3">by SNOWBROS · version 0.1.0 (development build, Windows)</p>
      <dl className="mt-5 grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
        <dt className="text-ink-3">Playback engine</dt>
        <dd className="text-ink">{engine?.mpvVersion ?? "Not reported"}</dd>
        <dt className="text-ink-3">FFmpeg</dt>
        <dd className="text-ink">{engine?.ffmpegVersion ?? "Not reported"}</dd>
        <dt className="text-ink-3">Video output</dt>
        <dd className="text-ink">{engine ? `${engine.videoOutput ?? "?"} / ${engine.gpuContext ?? "?"}` : "Not reported"}</dd>
      </dl>
      <p className="mt-5 max-w-lg text-[12.5px] leading-relaxed text-ink-3">
        This is a local development build. Its licensing is not yet final (the bundled engine build is GPL-licensed), so it is not for redistribution. Interface
        font: Archivo, SIL Open Font License 1.1.
      </p>
    </section>
  );
}

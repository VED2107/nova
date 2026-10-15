import { useMemo } from "react";
import { Button, Kbd } from "../../components/ui/controls";
import { Dialog } from "../../components/ui/Dialog";
import { ACTIONS, chordLabel, effectiveKeymap, parseKeymap, type ActionGroup } from "../../services/playback/actions";
import { usePrefs } from "../../services/prefs";

const GROUPS: ActionGroup[] = ["Playback", "Navigation", "Audio", "Subtitles", "Video", "Queue", "View"];

/** Current bindings (including custom ones) plus mouse behaviour. */
export function ShortcutsDialog(props: { open: boolean; onClose: () => void; onCustomize: () => void }) {
  const p = usePrefs();
  const map = useMemo(() => effectiveKeymap(parseKeymap(p.keymap)), [p.keymap]);
  const wheel = { volume: "changes volume", seek: "seeks", none: "does nothing" }[p.wheel];
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Keyboard & mouse"
      description="Shortcuts work in the player. Search in the library with / or Ctrl+F."
      width="min(860px, calc(100vw - 48px))"
      footer={
        <Button variant="quiet" onClick={props.onCustomize}>
          Customize…
        </Button>
      }
    >
      <div className="columns-2 gap-8 px-5 py-4 max-[720px]:columns-1">
        {GROUPS.map((g) => (
          <section key={g} className="mb-5 break-inside-avoid">
            <h3 className="catalog mb-1.5 text-ink-3">{g}</h3>
            <dl className="border-t border-seam">
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-b border-seam py-1.5">
                  <dt className="text-[13px] text-ink">{a.label}</dt>
                  <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                    {map[a.id]!.length ? map[a.id]!.map((c) => <Kbd key={c}>{chordLabel(c)}</Kbd>) : <span className="text-[12px] italic text-ink-3">none</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="mb-5 break-inside-avoid">
          <h3 className="catalog mb-1.5 text-ink-3">Mouse</h3>
          <ul className="space-y-1 border-t border-seam pt-1.5 text-[13px] text-ink">
            <li>Wheel over the picture {wheel}; over the timeline it seeks</li>
            <li>Click: {p.click === "pause" ? "play / pause" : "nothing"} · Double-click: {p.dblclick === "fullscreen" ? "fullscreen" : "nothing"}</li>
            <li>Right-click: the full player menu</li>
            <li>Back / forward buttons: previous / next in queue</li>
          </ul>
        </section>
      </div>
    </Dialog>
  );
}

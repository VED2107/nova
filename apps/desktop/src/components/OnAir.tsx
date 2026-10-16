/** The tally from the player, carried onto the shelf: this title is loaded right now. */
export function OnAir({ className = "", paper }: { className?: string; paper?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-[3px] ${paper ? "text-ink" : "bg-[#0e0e0d]/90 text-[#f2efe8]"} ${className}`}
      title="Loaded in the player"
    >
      <span aria-hidden className="size-[7px] rounded-[1.5px] bg-ember" />
      <span className="engrave">On air</span>
    </span>
  );
}

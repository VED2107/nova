/* NOVA wordmark, geometry from brand/build_brand.py (nova-wordmark.svg).
   The N's beam is the only ember element; everything else is currentColor. */
export function Wordmark({ height = 18, className = "" }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox="0 40 758 176"
      height={height}
      width={(height * 758) / 176}
      role="img"
      aria-label="NOVA"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 40h32v176h-32zM144 40h32v176h-32zM216 128a88 88 0 1 0 176 0a88 88 0 1 0 -176 0zM248 128a56 56 0 1 1 112 0a56 56 0 1 1 -112 0zM422 40L456 40L504 216L552 40L586 40L538 216L470 216zM594 216L628 216L676 40L724 216L758 216L710 40L642 40z"
      />
      <path fill="#F97316" d="M42 40h44L134 216h-44z" />
    </svg>
  );
}

/* The Lumen N symbol for compact places. */
export function Symbol({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="40 40 176 176" width={size} height={size} aria-hidden focusable={false}>
      <path fill="currentColor" d="M40 40h32v176h-32zM184 40h32v176h-32z" />
      <path fill="#F97316" d="M82 40h44L174 216h-44z" />
    </svg>
  );
}

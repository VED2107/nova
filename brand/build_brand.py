"""Generates NOVA's master brand SVGs from explicit geometry (no fonts, no <text>).

Construction (256 grid, cap height 176):
- Symbol "Lumen N": two 32-wide stems; a 44-wide beam (horizontal measure) with
  parallel edges running from the top of the left stem to the foot of the right
  stem, slope 48/176 (15.3 deg from vertical); 10-unit stencil gaps.
- Small cut (<= 32 px): 40-wide stems, 52-wide beam, 16-unit gaps, taller.
- Wordmark: N = symbol letter; O = 32-weight ring opened by a 10-unit cut at
  45 deg upper right (where light enters); V and A (as a stencil Lambda) use the
  beam's slope with 34-wide strokes and a 10-unit apex gap.
Run: python brand/build_brand.py
"""
import math
from pathlib import Path

INK, CREAM, EMBER = "#171715", "#F7F4EE", "#F97316"
OUT = Path(__file__).parent / "final"
OUT.mkdir(exist_ok=True)


def svg(w, h, body, title="NOVA"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
            f"<title>{title}</title>{body}</svg>\n")


def n_parts(x, y, stem=32, beam=44, gap=10, height=176, slope=48):
    """Stems and beam of the stencil N with top-left at (x, y)."""
    width = stem * 2 + gap * 2 + beam + slope  # 176 for defaults
    s1 = f"M{x} {y}h{stem}v{height}h{-stem}z"
    s2 = f"M{x + width - stem} {y}h{stem}v{height}h{-stem}z"
    bx = x + stem + gap
    b = f"M{bx} {y}h{beam}L{bx + beam + slope} {y + height}h{-beam}z"
    return s1 + s2, b, width


def ring_open(cx, cy, r_out=88, weight=32, gap=10, at_deg=-45):
    """Ring with a straight radial cut of `gap` width centred at angle at_deg."""
    r_in = r_out - weight
    # half-gap offsets measured perpendicular to the cut direction
    a = math.radians(at_deg)
    ux, uy = math.cos(a), math.sin(a)         # cut direction
    px, py = -uy, ux                           # perpendicular
    h = gap / 2

    def on_circle(r, side):
        # point on circle radius r whose perpendicular distance from cut line = side*h
        t = math.sqrt(r * r - h * h)
        return (cx + ux * t + px * h * side, cy + uy * t + py * h * side)

    o1, o2 = on_circle(r_out, 1), on_circle(r_out, -1)
    i1, i2 = on_circle(r_in, 1), on_circle(r_in, -1)
    f = lambda p: f"{p[0]:.3f} {p[1]:.3f}"
    # outer arc from o1 the long way round to o2, then inner arc back
    return (f"M{f(o1)}A{r_out} {r_out} 0 1 1 {f(o2)}L{f(i2)}"
            f"A{r_in} {r_in} 0 1 0 {f(i1)}Z")


def v_letter(x, y, stroke=34, slope=48, height=176, flip=False):
    """Solid V (or Lambda when flip): two strokes on the beam's slope whose
    inner edges meet exactly on the baseline (or cap line)."""
    w = 2 * (stroke + slope)
    yt, yb = (y + height, y) if flip else (y, y + height)
    pts = [(x, yt), (x + stroke, yt), (x + stroke + slope, yb), (x + w - stroke, yt),
           (x + w, yt), (x + w - slope, yb), (x + slope, yb)]
    return "M" + "L".join(f"{a} {b}" for a, b in pts) + "z", w


def a_letter(x, y, **kw):
    return v_letter(x, y, flip=True, **kw)


def symbol(stem_color, beam_color, small=False, bg=None, radius=0):
    if small:
        stems, beam, w = n_parts(28, 28, stem=40, beam=52, gap=16, height=200, slope=48)
    else:
        stems, beam, w = n_parts(40, 40)
    if bg:
        # App icon: symbol at ~70% of the tile, optically centred.
        tile = f'<rect width="256" height="256" rx="{radius}" fill="{bg}"/>'
        g = '<g transform="translate(128 128) scale(0.70) translate(-128 -128)">'
        return svg(256, 256, f'{tile}{g}<path d="{stems}" fill="{stem_color}"/><path d="{beam}" fill="{beam_color}"/></g>')
    return svg(256, 256, f'<path d="{stems}" fill="{stem_color}"/><path d="{beam}" fill="{beam_color}"/>')


def wordmark_paths(x0=0, y0=40):
    stems, beam, nw = n_parts(x0, y0)
    x = x0 + nw + 40
    # Plain ring: the stencil cut belongs to the N alone.
    o = (f"M{x} {y0 + 88}a88 88 0 1 0 176 0a88 88 0 1 0 -176 0z"
         f"M{x + 32} {y0 + 88}a56 56 0 1 1 112 0a56 56 0 1 1 -112 0z")
    x += 176 + 30
    v, vw = v_letter(x, y0)
    x += vw + 8
    a, aw = a_letter(x, y0)
    return stems, beam, o + v + a, x + aw


def wordmark(ink, beam_color):
    stems, beam, rest, w = wordmark_paths()
    return svg(w, 256, f'<path d="{stems}{rest}" fill="{ink}" fill-rule="evenodd"/><path d="{beam}" fill="{beam_color}"/>')


def lockup(ink, beam_color):
    # symbol (256) + 48 space + wordmark; symbol beam ember, wordmark one colour
    stems_s, beam_s, _ = n_parts(40, 40)
    stems, beam, rest, w = wordmark_paths(x0=256 + 8)
    total = w + 40
    body = (f'<path d="{stems_s}" fill="{ink}"/><path d="{beam_s}" fill="{beam_color}"/>'
            f'<path d="{stems}{beam}{rest}" fill="{ink}"/>')
    return svg(total, 256, body)


files = {
    "nova-symbol.svg": symbol(INK, EMBER),
    "nova-symbol-on-dark.svg": symbol(CREAM, EMBER),
    "nova-symbol-black.svg": symbol("#000", "#000"),
    "nova-symbol-white.svg": symbol("#FFF", "#FFF"),
    "nova-symbol-small.svg": symbol(INK, EMBER, small=True),
    "nova-app-icon.svg": symbol(CREAM, EMBER, small=True, bg=INK, radius=56),
    "nova-wordmark.svg": wordmark(INK, EMBER),
    "nova-wordmark-on-dark.svg": wordmark(CREAM, EMBER),
    "nova-wordmark-black.svg": wordmark("#000", "#000"),
}
for name, content in files.items():
    (OUT / name).write_text(content, encoding="utf-8")
    print("wrote", OUT / name)

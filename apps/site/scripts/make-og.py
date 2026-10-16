"""Builds public/og.png (1200x630): the NOVA wordmark drawn from the brand
master geometry (brand/final/nova-wordmark.svg) beside a real capture of the
player (public/shots/player-playing.webp, Tears of Steel (CC) Blender
Foundation, CC BY 3.0). No fonts, no generated imagery."""
from PIL import Image, ImageDraw
from pathlib import Path

here = Path(__file__).resolve().parent.parent
W, H, SS = 1200, 630, 4
img = Image.new("RGB", (W * SS, H * SS), (247, 244, 238))
d = ImageDraw.Draw(img)
INK, EMBER = (23, 23, 21), (249, 115, 22)

# Wordmark: master units (viewBox y 40..216), scaled.
s = 0.62 * SS
ox, oy = 72 * SS, 120 * SS - 40 * s
P = lambda x, y: (ox + x * s, oy + y * s)
def poly(pts, c): d.polygon([P(*p) for p in pts], fill=c)
poly([(0,40),(32,40),(32,216),(0,216)], INK)
poly([(144,40),(176,40),(176,216),(144,216)], INK)
poly([(42,40),(86,40),(134,216),(90,216)], EMBER)
cx, cy = P(304, 128)
d.ellipse([cx-88*s, cy-88*s, cx+88*s, cy+88*s], fill=INK)
d.ellipse([cx-56*s, cy-56*s, cx+56*s, cy+56*s], fill=(247,244,238))
poly([(422,40),(456,40),(504,216),(552,40),(586,40),(538,216),(470,216)], INK)
poly([(594,216),(628,216),(676,40),(724,216),(758,216),(710,40),(642,40)], INK)

# Player capture on a darkroom plate, bleeding off the right and bottom.
shot = Image.open(here / "public/shots/player-playing.webp").convert("RGB")
pw = 780 * SS
ph = int(shot.height * pw / shot.width)
shot = shot.resize((pw, ph), Image.LANCZOS)
px, py = 470 * SS, 250 * SS
d.rounded_rectangle([px - 14*SS, py - 14*SS, px + pw + 14*SS, py + ph + 14*SS], radius=14*SS, fill=(11, 11, 10))
img.paste(shot, (px, py))
# Beam playhead rule under the wordmark.
d.rectangle([72*SS, 268*SS, 400*SS, 271*SS], fill=INK)

img = img.resize((W, H), Image.LANCZOS)
img.save(here / "public/og.png", optimize=True)
print("public/og.png", img.size)

# Gera public/assets/ui/lobby/arena/icons/guild-emblem.png a partir do
# emblema bruto: remove o fundo preto (flood fill pelas bordas), recorta ao
# conteudo e normaliza para um quadrado 512x512 com alpha.
from PIL import Image, ImageDraw
import sys

src, dst = sys.argv[1], sys.argv[2]
side_out = int(sys.argv[3]) if len(sys.argv) > 3 else 512
img = Image.open(src).convert('RGB')
w, h = img.size
MARK = (255, 0, 255)
for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
    if img.getpixel(corner) != MARK:
        ImageDraw.floodfill(img, corner, MARK, thresh=42)
px = img.load()
alpha = Image.new('L', (w, h), 255)
ap = alpha.load()
for y in range(h):
    for x in range(w):
        if px[x, y] == MARK:
            ap[x, y] = 0
rgba = Image.open(src).convert('RGBA')
rgba.putalpha(alpha)
bbox = alpha.getbbox()
rgba = rgba.crop(bbox)
cw, ch = rgba.size
side = max(cw, ch)
pad = int(side * 0.02)
side += pad * 2
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(rgba, ((side - cw) // 2, (side - ch) // 2), rgba)
out = square.resize((side_out, side_out), Image.LANCZOS)
out.save(dst)
print('ok', dst, out.size)

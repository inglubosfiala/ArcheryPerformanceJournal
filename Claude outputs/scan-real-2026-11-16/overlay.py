import sys, json, math, os
from PIL import Image, ImageOps, ImageDraw, ImageFont
res = json.load(open(sys.argv[1])); outdir = sys.argv[2]
SCORE = lambda v: 10 if v == 'X' else v
try: font = ImageFont.truetype('arialbd.ttf', 34)
except: font = ImageFont.load_default()
for name, r in res.items():
    L = r[r['keptLook']]
    im = ImageOps.exif_transpose(Image.open(r['file'])).convert('RGB')
    b = L['box']; s = L['scale']
    crop = im.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']))
    k = 1100 / crop.height; crop = crop.resize((round(crop.width * k), 1100), Image.LANCZOS)
    d = ImageDraw.Draw(crop)
    f = k / s  # picture px -> overlay px
    for sp in L['spots']:
        for frac in (0.1, 0.2, 0.4, 0.6, 0.8, 1.0):
            pts = []
            for t in range(73):
                a = t * 2 * math.pi / 72
                ex, ey = sp['rx'] * frac * math.cos(a), sp['ry'] * frac * math.sin(a)
                c, sn = math.cos(sp['angle']), math.sin(sp['angle'])
                pts.append(((sp['cx'] + c * ex - sn * ey) * f, (sp['cy'] + sn * ex + c * ey) * f))
            d.line(pts, fill=(0, 255, 0), width=2)
    for a, v in zip(L['arrows'], L['scores']):
        x, y = a['image']['x'] * f, a['image']['y'] * f
        want = r['truth'][a['spot']]
        ok = SCORE(v) == want
        col = (0, 200, 0) if ok else (255, 0, 255)
        d.ellipse((x - 9, y - 9, x + 9, y + 9), outline=col, width=4)
        d.line((x - 16, y, x + 16, y), fill=col, width=2); d.line((x, y - 16, x, y + 16), fill=col, width=2)
        d.text((x + 18, y - 40), f"{v} (true {want})", fill=col, font=font, stroke_width=3, stroke_fill=(0, 0, 0))
    crop.save(os.path.join(outdir, name + '.jpg'), quality=85)
print('ok')

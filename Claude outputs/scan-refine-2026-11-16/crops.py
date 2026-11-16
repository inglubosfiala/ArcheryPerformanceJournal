# Full-size crops around each arrow a variant still gets wrong: the fitted ring edges (green) and the refined tip (magenta).
# python -I crops.py <results.json> <photosDir> <outDir> [variant]
import sys, os, json, math
from PIL import Image, ImageOps, ImageDraw

res, photos, out = sys.argv[1], sys.argv[2], sys.argv[3]
variant = sys.argv[4] if len(sys.argv) > 4 else 'A+cut'
os.makedirs(out, exist_ok=True)
val = lambda v: 10 if v == 'X' else (0 if v == 'M' else v)
cache = {}
for r in json.load(open(res))['rows']:
    if val(r['read'][variant]) == r['truth'] and not (len(sys.argv) > 5 and r['photo'] + str(r['spot']) in sys.argv[5].split(',')):
        continue
    name = r['photo']
    if name not in cache:
        cache[name] = ImageOps.exif_transpose(Image.open(os.path.join(photos, name + '.jpg'))).convert('RGB')
    im = cache[name]
    o, t = r['outer'], r['tipFull']
    s = (o['rx'] + o['ry']) / 2 / 100  # px per mm
    half = 30 * s
    box = (int(t['x'] - half), int(t['y'] - half), int(t['x'] + half), int(t['y'] + half))
    crop = im.crop(box).resize((600, 600), Image.LANCZOS)
    k = 600 / (2 * half)
    d = ImageDraw.Draw(crop)
    ca, sa = math.cos(o['angle']), math.sin(o['angle'])
    for e in (0.2, 0.4, 0.6, 0.8, 1.0):
        pts = []
        for i in range(721):
            a = i / 720 * 2 * math.pi
            u1, u2 = (ca * math.cos(a) * e + sa * math.sin(a) * e) * o['rx'], (-sa * math.cos(a) * e + ca * math.sin(a) * e) * o['ry']
            x, y = o['cx'] + ca * u1 - sa * u2, o['cy'] + sa * u1 + ca * u2
            pts.append(((x - box[0]) * k, (y - box[1]) * k))
        d.line(pts, fill=(0, 255, 0), width=1)
    for q in r.get('ringPts', []):
        qx, qy = (q['x'] - box[0]) * k, (q['y'] - box[1]) * k
        d.ellipse((qx - 2, qy - 2, qx + 2, qy + 2), fill=(0, 220, 255))
    b = r.get('baseFull')
    if b:
        bx, by = (b['x'] - box[0]) * k, (b['y'] - box[1]) * k
        d.line((bx - 6, by, bx + 6, by), fill=(255, 255, 255), width=2); d.line((bx, by - 6, bx, by + 6), fill=(255, 255, 255), width=2)
    cx, cy = (t['x'] - box[0]) * k, (t['y'] - box[1]) * k
    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), outline=(255, 0, 255), width=2)
    d.text((6, 6), f"{name} spot {r['spot']} real {r['truth']} read {r['read'][variant]} ({variant})", fill=(255, 0, 255))
    crop.save(os.path.join(out, f"{name}_s{r['spot']}.jpg"), quality=90)
    print(name, r['spot'])

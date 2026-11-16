# Clean full-size crops (no overlays) around every arrow, for marking the true hole by hand.
# python -I make_crops.py <results.json from refine.mjs> <photosDir> <outDir>
# Writes <outDir>/crops/<id>.jpg and <outDir>/manifest.json: [{ id, photo, spot, truth, file, box: [x0, y0], pxPerMm, size }]
import sys, os, json
from PIL import Image, ImageOps

res, photos, out = sys.argv[1], sys.argv[2], sys.argv[3]
HALF_MM = 25
os.makedirs(os.path.join(out, 'crops'), exist_ok=True)
rows = json.load(open(res))['rows']
cache, manifest = {}, []
for r in rows:
    name = r['photo']
    if name not in cache:
        cache[name] = ImageOps.exif_transpose(Image.open(os.path.join(photos, name + '.jpg'))).convert('RGB')
    o, c = r['outer'], r['baseFull']
    s = (o['rx'] + o['ry']) / 2 / 100
    h = round(HALF_MM * s)
    x0, y0 = round(c['x']) - h, round(c['y']) - h
    rid = f"{name}_s{r['spot']}"
    cache[name].crop((x0, y0, x0 + 2 * h, y0 + 2 * h)).save(os.path.join(out, 'crops', rid + '.jpg'), quality=95)
    manifest.append({'id': rid, 'photo': name, 'spot': r['spot'], 'truth': r['truth'], 'file': f'crops/{rid}.jpg', 'box': [x0, y0], 'pxPerMm': round(s, 4), 'size': 2 * h})
json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
print(len(manifest))

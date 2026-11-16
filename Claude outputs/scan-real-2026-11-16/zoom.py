# Zoomed debug views around each arrow: picture as analysed, dark mask (magenta), shafts (cyan), point (green/red).
import sys, json, os, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont
dbg, outdir, only_wrong = sys.argv[1], sys.argv[2], (len(sys.argv) > 3 and sys.argv[3] == 'wrong')
os.makedirs(outdir, exist_ok=True)
R, K = 55, 5
font = ImageFont.truetype('arialbd.ttf', 22)
for jf in sorted(glob.glob(os.path.join(dbg, '*.json'))):
    name = os.path.basename(jf)[:-5]
    j = json.load(open(jf)); w, h = j['size']
    pic = np.frombuffer(open(os.path.join(dbg, name + '.pic'), 'rb').read(), np.uint8).reshape(h, w, 4)[:, :, :3]
    dark = np.frombuffer(open(os.path.join(dbg, name + '.dark'), 'rb').read(), np.uint8).reshape(h, w)
    for i, a in enumerate(j['arrows']):
        if only_wrong and a['right']: continue
        cx, cy = a['image']['x'], a['image']['y']
        x0, y0 = int(round(cx)) - R, int(round(cy)) - R
        tile = np.zeros((2 * R, 2 * R, 3), np.uint8); mt = np.zeros((2 * R, 2 * R), np.uint8)
        xs0, ys0, xs1, ys1 = max(0, x0), max(0, y0), min(w, x0 + 2 * R), min(h, y0 + 2 * R)
        tile[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = pic[ys0:ys1, xs0:xs1]
        mt[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = dark[ys0:ys1, xs0:xs1]
        raw = Image.fromarray(tile).resize((2 * R * K, 2 * R * K), Image.NEAREST)
        ov = tile.copy(); ov[mt == 1] = (ov[mt == 1] * 0.4 + np.array([255, 0, 255]) * 0.6).astype(np.uint8)
        im = Image.fromarray(ov).resize((2 * R * K, 2 * R * K), Image.NEAREST)
        d = ImageDraw.Draw(im)
        P = lambda p: ((p['x'] - x0 + 0.5) * K, (p['y'] - y0 + 0.5) * K)
        for sh in j['shafts']:
            d.line([P(sh['a']), P(sh['b'])], fill=(0, 255, 255), width=2)
            tx, ty = P(sh['tip']); d.ellipse((tx - 5, ty - 5, tx + 5, ty + 5), outline=(0, 255, 255), width=2)
        px, py = P(a['image']); col = (0, 255, 0) if a['right'] else (255, 40, 40)
        d.ellipse((px - 9, py - 9, px + 9, py + 9), outline=col, width=3)
        both = Image.new('RGB', (4 * R * K + 10, 2 * R * K + 34), 'white')
        both.paste(raw, (0, 34)); both.paste(im, (2 * R * K + 10, 34))
        ImageDraw.Draw(both).text((6, 4), f"{name} spot {a['spot']}  read {a['score']} true {a['truth']}  d={a['d']}", fill='black', font=font)
        both.save(os.path.join(outdir, f"{name}_s{a['spot']}.png"))
print('ok')

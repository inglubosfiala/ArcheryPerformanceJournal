// Batch run of the app's photo path (scan.js readPhoto): whole look, then close-up of the sheet.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, rawDir, outFile, face = '40t'] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const { detectArrows } = await imp('public/js/app/photoDetect.js');
const { scoresOf, PHOTO_MAX } = await imp('public/js/app/scan.js');
const { CLOSE_UP_MARGIN, spotsBox, isCloseUp, keepCloseUp } = await imp('public/js/app/scanGeometry.js');

const meta = JSON.parse(fs.readFileSync(path.join(rawDir, 'meta.json'), 'utf8'));
// area-average resample of box at scale (like drawImage with smoothing)
function draw(src, W, box, scale) {
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = box.y + (y * box.h) / h, sy1 = box.y + ((y + 1) * box.h) / h;
    for (let x = 0; x < w; x++) {
      const sx0 = box.x + (x * box.w) / w, sx1 = box.x + ((x + 1) * box.w) / w;
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++)
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const i = (yy * W + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
        }
      const o = (y * w + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
const out = {};
for (const [name, m] of Object.entries(meta)) {
  const t0 = Date.now();
  const src = fs.readFileSync(path.join(rawDir, name + '.rgba'));
  const truth = name.split('_').slice(1).map(Number);
  const look = (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    const pic = draw(src, m.width, box, scale);
    return { box, scale, size: [pic.width, pic.height], res: detectArrows(pic, face, 3, process.env.GAP ? { shaftGap: +process.env.GAP } : {}) };
  };
  const whole = { x: 0, y: 0, w: m.width, h: m.height };
  const first = look(whole);
  let kept = first, second = null;
  if (!first.res.error) {
    const box = spotsBox(first.res.spots, { margin: CLOSE_UP_MARGIN, bounds: whole, scale: first.scale });
    if (isCloseUp(box, whole)) {
      second = look(box);
      if (keepCloseUp(first.res, second.res)) kept = second;
    }
  }
  const pack = (l) => l && {
    box: l.box, scale: l.scale, size: l.size, error: l.res.error ?? null, partial: l.res.partial ?? null,
    spots: (l.res.spots || []).map((s) => s.outer),
    arrows: (l.res.arrows || []).map((a, i) => ({ spot: a.spot, x: +a.x.toFixed(4), y: +a.y.toFixed(4), d: +Math.hypot(a.x, a.y).toFixed(4), image: a.image, kind: a.lean ? 'shaft' : 'blob', area: a.area })),
    scores: l.res.arrows ? scoresOf(l.res.arrows, face) : [],
  };
  out[name] = { truth, file: m.path, keptLook: kept === second ? 'closeup' : 'whole', whole: pack(first), closeup: pack(second), ms: Date.now() - t0 };
  const k = out[name][out[name].keptLook];
  console.log(name, 'truth', truth.join(','), '| got', k.error ?? k.arrows.map((a) => `s${a.spot}:${scoresOf([a], face)[0]}`).join(' '), '|', out[name].keptLook, out[name].ms + 'ms');
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

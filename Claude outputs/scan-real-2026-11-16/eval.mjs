// Real-photo eval of the photo scan (scan.js readPhoto: whole look, then the close-up of the sheet).
// node eval.mjs <repo> <meta.json> <out.json> [debugDir]
// meta.json: { name: { width, height, rgba, path } }, ground truth from the name (XY_top_mid_bottom).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, metaFile, outFile, debugDir] = process.argv.slice(2);
const face = '40t';
const imp = (p) => import(pathToFileURL(path.join(repo, p)).href + '?t=' + Date.now());
const { detectArrows } = await imp('public/js/app/photoDetect.js');
const { scoresOf, PHOTO_MAX } = await imp('public/js/app/scan.js');
const { CLOSE_UP_MARGIN, spotsBox, isCloseUp, keepCloseUp } = await imp('public/js/app/scanGeometry.js');
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
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
const val = (v) => (v === 'X' ? 10 : v);
const out = {};
let ok = 0, n = 0;
for (const [name, m] of Object.entries(meta)) {
  const src = fs.readFileSync(m.rgba);
  const truth = name.split('_').slice(1).map(Number);
  const look = (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    const pic = draw(src, m.width, box, scale);
    return { box, scale, pic, res: detectArrows(pic, face, 3, { debug: !!debugDir, ...JSON.parse(process.env.OPTS || '{}') }) };
  };
  const whole = { x: 0, y: 0, w: m.width, h: m.height };
  const first = look(whole);
  let kept = first;
  if (!first.res.error) {
    const box = spotsBox(first.res.spots, { margin: CLOSE_UP_MARGIN, bounds: whole, scale: first.scale });
    if (isCloseUp(box, whole)) {
      const second = look(box);
      if (keepCloseUp(first.res, second.res)) kept = second;
    }
  }
  const res = kept.res;
  const scores = res.error ? [] : scoresOf(res.arrows, face);
  const arrows = (res.arrows || []).map((a, i) => {
    const right = val(scores[i]) === truth[a.spot];
    n++; if (right) ok++;
    return { spot: a.spot, x: +a.x.toFixed(4), y: +a.y.toFixed(4), d: +Math.hypot(a.x, a.y).toFixed(4), image: a.image, kind: a.lean ? 'shaft' : 'blob', score: scores[i], truth: truth[a.spot], right };
  });
  out[name] = { truth, file: m.path, box: kept.box, scale: kept.scale, size: [kept.pic.width, kept.pic.height], spots: (res.spots || []).map((s) => s.outer), arrows };
  if (debugDir) {
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(path.join(debugDir, name + '.pic'), kept.pic.data);
    fs.writeFileSync(path.join(debugDir, name + '.dark'), res.debug.dark);
    fs.writeFileSync(path.join(debugDir, name + '.json'), JSON.stringify({ size: [kept.pic.width, kept.pic.height], shafts: res.debug.shafts, arrows }));
  }
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
for (const [name, o] of Object.entries(out)) console.log(name.padEnd(12), o.arrows.map((a) => `${a.right ? ' ' : '*'}${a.score}/${a.truth}`).join(' '));
console.log(`RIGHT ${ok}/${n}`);

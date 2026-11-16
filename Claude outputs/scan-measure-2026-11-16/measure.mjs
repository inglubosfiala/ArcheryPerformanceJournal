// Where the photo scan goes wrong on real photos: "did not find the arrow" or "found it, the point is a bit off".
// node measure.mjs <repo> <rawDir> [out.json]
//   rawDir: <name>.rgba + meta.json from scan-real-2026-11-16/decode.py
// Runs the app's photo path (scan.js readPhoto: whole look, then the close-up of the sheet) on the 40 cm triple,
// with ground truth from the file name (XY_top_middle_bottom.jpg). X counts as 10.
//
// For every arrow it reports the smallest move of the found point that would have given the real score
// ("shift", mm on paper; one spot radius = 100 mm, one ring = 20 mm). That is a lower bound on how far the
// point is from the real hole. Classes:
//   right        score right
//   line         wrong, shift <= LINE_MM: the point is at the right place give or take a line cutter
//   off          wrong, shift <= OFF_MM: the right arrow, but the point is off along the shaft
//   lost         wrong, shift > OFF_MM: a different thing was taken for the arrow (old hole, fletching, other sheet)
//   missing      no arrow found on that spot
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, rawDir, outFile] = process.argv.slice(2);
const FACE = '40t';
const MM = 100; // mm per spot radius on the 40 cm sheet
const LINE_MM = 5;
const OFF_MM = 15;

const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const { detectArrows } = await imp('public/js/app/photoDetect.js');
const { scoresOf, PHOTO_MAX } = await imp('public/js/app/scan.js');
const { CLOSE_UP_MARGIN, spotsBox, isCloseUp, keepCloseUp } = await imp('public/js/app/scanGeometry.js');

// area-average resample of a box of the photo (like canvas drawImage with smoothing)
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

// the band of radii (spot radii) that scores `v` on a 10–6 spot: 10 = [0, 0.2], 9 = [0.2, 0.4] … 6 = [0.8, 1]
const band = (v) => [(10 - v) * 0.2, (11 - v) * 0.2];
const val = (v) => (v === 'X' ? 10 : v === 'M' ? 0 : v);
// mm the point must move (along the radius) to land in the band
function shiftMm(d, truth) {
  const [lo, hi] = band(truth);
  return d < lo ? (lo - d) * MM : d >= hi ? (d - hi) * MM : 0;
}
// mm from the point to the nearest ring line (how close a right score was to being wrong)
const lineMm = (d) => Math.min(...[0.2, 0.4, 0.6, 0.8, 1].map((e) => Math.abs(d - e))) * MM;

const meta = JSON.parse(fs.readFileSync(path.join(rawDir, 'meta.json'), 'utf8'));
const rows = [];
const photos = {};
for (const [name, m] of Object.entries(meta)) {
  const t0 = Date.now();
  const src = fs.readFileSync(path.join(rawDir, name + '.rgba'));
  const truth = name.split('_').slice(1).map(Number);
  const look = (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    return { scale, res: detectArrows(draw(src, m.width, box, scale), FACE, 3, JSON.parse(process.env.OPTS || '{}')) };
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
  const arrows = res.error ? [] : res.arrows;
  const scores = res.error ? [] : scoresOf(arrows, FACE);
  photos[name] = { error: res.error ?? null, partial: res.partial ?? null, spots: res.spots?.length ?? 0, found: arrows.length, ms: Date.now() - t0 };
  truth.forEach((t, spot) => {
    const i = arrows.findIndex((a) => a.spot === spot);
    if (i < 0) return rows.push({ photo: name, spot, truth: t, cls: 'missing' });
    const a = arrows[i];
    const d = Math.hypot(a.x, a.y);
    const shift = shiftMm(d, t);
    const right = val(scores[i]) === t;
    const cls = right ? 'right' : shift <= LINE_MM ? 'line' : shift <= OFF_MM ? 'off' : 'lost';
    rows.push({ photo: name, spot, truth: t, read: scores[i], cls, d: +d.toFixed(4), shiftMm: +shift.toFixed(1), lineMm: +lineMm(d).toFixed(1), kind: a.lean ? 'shaft' : 'blob' });
  });
}

const count = (c) => rows.filter((r) => r.cls === c).length;
const wrong = rows.filter((r) => r.cls !== 'right');
const right = rows.filter((r) => r.cls === 'right');
const SPOT = ['top', 'mid', 'bot'];
console.log('photo        spot  real read  class    shift  kind');
for (const r of wrong)
  console.log(`${r.photo.padEnd(12)} ${SPOT[r.spot]}   ${String(r.truth).padStart(4)} ${String(r.read ?? '-').padStart(4)}  ${r.cls.padEnd(7)} ${r.shiftMm != null ? (r.shiftMm + ' mm').padStart(7) : '      -'}  ${r.kind ?? ''}`);
console.log('');
console.log(`right   ${count('right')}/${rows.length}`);
console.log(`line    ${count('line')}   (wrong, point within ${LINE_MM} mm of the right ring)`);
console.log(`off     ${count('off')}   (wrong, ${LINE_MM}-${OFF_MM} mm)`);
console.log(`lost    ${count('lost')}   (wrong, > ${OFF_MM} mm: another thing taken for the arrow)`);
console.log(`missing ${count('missing')}`);
const near = right.filter((r) => r.lineMm <= 3).length;
console.log(`right but within 3 mm of a line: ${near}/${right.length}`);
const ms = Object.values(photos).map((p) => p.ms);
console.log(`time per photo: ${Math.min(...ms)}-${Math.max(...ms)} ms`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ face: FACE, LINE_MM, OFF_MM, photos, rows }, null, 1));

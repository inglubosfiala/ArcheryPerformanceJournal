// Prototype: full-resolution refinement of each found arrow (step 1 of the hybrid plan).
// node refine.mjs <repo> <rawDir> [out.json]
//   repo:   a checkout whose public/js/app holds the detector (the frozen commit is used, see README)
//   rawDir: <name>.rgba + meta.json from ../scan-real-2026-11-16/decode.py
//
// The app's photo path finds the arrows on a 640 px close-up (~1 mm per px). Here, after that, each arrow is
// measured again on the full-size photo (~3-4x the pixels):
//   A  tip:   profiles across the shaft along its line give the shaft's centre line, width and darkness; walking
//             from the solid shaft to the paper, the shaft ends where it is no longer dark (gaps of up to GAP mm
//             are bridged) or where the dark area gets much wider than the shaft (a hole or blob, not the shaft).
//   B  ring:  when the point is near a ring line, the line is found on the photo itself, on radial profiles beside
//             the shaft, and the point is scored against that line instead of the ring from the fitted ellipse.
//   cut:      the WA line cutter rule: the shaft's edge nearest the centre scores (radius minus half the shaft width).
// Every combination is scored against the file names (XY_top_middle_bottom.jpg, X = 10).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, rawDir, outFile] = process.argv.slice(2);
const FACE = '40t';
const MM = 100; // mm per spot radius on the 40 cm sheet
const TUNE = { gap: 2, widen: 2.2, near: 0.06, ...JSON.parse(process.env.TUNE || '{}') };

const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const { detectArrows } = await imp('public/js/app/photoDetect.js');
const { scoresOf, PHOTO_MAX } = await imp('public/js/app/scan.js');
const { CLOSE_UP_MARGIN, spotsBox, isCloseUp, keepCloseUp, faceFromPicture, pictureFromFace } = await imp('public/js/app/scanGeometry.js');
const { scoreFromPoint } = await imp('public/js/app/scoring.js');

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

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, q) => p - q);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Bilinear RGB sampler of the full-size photo. */
function sampler(src, W, H) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return null;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const i = (y0 * W + x0) * 4 + c;
      const top = src[i] * (1 - fx) + src[i + 4] * fx;
      const bot = src[i + W * 4] * (1 - fx) + src[i + W * 4 + 4] * fx;
      out[c] = top * (1 - fy) + bot * fy;
    }
    return out;
  };
}
const bright = (c) => Math.max(c[0], c[1], c[2]);

/**
 * A: the shaft's end on the full-size photo. `tip` (full px) and `lean` (unit, from the tip towards the nock)
 * come from the detector; `s` is full px per mm (roughly). Returns { tip, half } or null when no shaft is seen.
 */
function refineTip(at, tip, lean, s) {
  const n = { x: -lean.y, y: lean.x };
  const L = 30 * s, back = 12 * s, half = 6 * s, step = 0.5;
  const us = [];
  for (let u = -half; u <= half + 1e-9; u += step) us.push(u);
  const profile = (t, off = 0) => us.map((u) => {
    const c = at(tip.x + lean.x * t + n.x * (u + off), tip.y + lean.y * t + n.y * (u + off));
    return c ? bright(c) : NaN;
  });
  // the solid shaft: centre, width and darkness, far enough from the paper
  const solid = [];
  for (let t = 0.35 * L; t <= L; t += step * 2) {
    const p = profile(t);
    if (p.some(Number.isNaN)) continue;
    const bg = median(p.filter((_, i) => Math.abs(us[i]) > 0.7 * half));
    const c = p.map((b) => Math.max(0, bg - b));
    const top = Math.max(...c);
    if (top < 20) continue;
    let w = 0, su = 0;
    c.forEach((v, i) => { if (v > top / 2) { w += v; su += v * us[i]; } });
    const width = c.filter((v) => v > top / 2).length * step;
    solid.push({ t, u: su / w, width, top });
  }
  if (solid.length < 6) return null;
  // centre line u(t) = a + b t (least squares), robust to a few outliers by using the middle widths
  const midW = median(solid.map((q) => q.width));
  const good = solid.filter((q) => q.width < 1.6 * midW && q.width > 0.5 * midW);
  if (good.length < 5) return null;
  const mt = good.reduce((a, q) => a + q.t, 0) / good.length, mu = good.reduce((a, q) => a + q.u, 0) / good.length;
  let sxy = 0, sxx = 0;
  for (const q of good) { sxy += (q.t - mt) * (q.u - mu); sxx += (q.t - mt) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  const a = mu - b * mt;
  const uOf = (t) => a + b * t;
  const C0 = median(good.map((q) => q.top));
  const W0 = median(good.map((q) => q.width));
  // walk from the solid shaft to the paper
  let end = null, gapStart = null;
  for (let t = 0.35 * L; t >= -back; t -= step) {
    const p = profile(t, uOf(t));
    if (p.some(Number.isNaN)) break;
    const bg = median(p.filter((_, i) => Math.abs(us[i]) > 0.7 * half));
    const c = p.map((v) => Math.max(0, bg - v));
    // darkness on the centre line (±a quarter of the width)
    const core = c.filter((_, i) => Math.abs(us[i]) <= Math.max(step, W0 / 4));
    const dark = core.reduce((x, y) => x + y, 0) / core.length;
    // dark width around the centre (contiguous)
    const mid = us.findIndex((u) => Math.abs(u) < step / 2 + 1e-9);
    let lo = mid, hi = mid;
    while (lo > 0 && c[lo - 1] > C0 / 2) lo--;
    while (hi < c.length - 1 && c[hi + 1] > C0 / 2) hi++;
    const width = (hi - lo + 1) * step;
    const isShaft = dark >= C0 / 2 && width <= TUNE.widen * W0;
    if (isShaft) { end = t; gapStart = null; continue; }
    if (dark >= C0 / 2 && width > TUNE.widen * W0) break; // a blob: the shaft ended at the last shaft profile
    if (gapStart == null) gapStart = t;
    if (gapStart - t > TUNE.gap * s) break;
  }
  if (end == null) return null;
  return { tip: { x: tip.x + lean.x * end + n.x * uOf(end), y: tip.y + lean.y * end + n.y * uOf(end) }, half: W0 / 2, moved: end };
}

/**
 * B: the ring line nearest the point, found on the photo. `outer` is the spot's edge in full px, `f` the point
 * on the face (spot radius 1), `shaft` = { tip, lean } in full px to keep the profiles off the shaft.
 * Returns the edge's radius as it is printed beside the point (face units), or null.
 */
const EDGES = [0.2, 0.4, 0.6, 0.8, 1.0];
function localEdge(at, outer, f, shaft, s) {
  const d = Math.hypot(f.x, f.y);
  const e = EDGES.reduce((p, q) => (Math.abs(q - d) < Math.abs(p - d) ? q : p));
  if (Math.abs(d - e) > TUNE.near) return null;
  const th = Math.atan2(f.y, f.x);
  const found = [];
  const dr = 0.0015, win = 0.012; // 0.15 mm samples, 1.2 mm windows
  for (let deg = -16; deg <= 16; deg += 2) {
    if (Math.abs(deg) < 3) continue;
    const a = th + (deg * Math.PI) / 180;
    const rs = [], cols = [];
    let blocked = false;
    for (let r = e - 0.07; r <= e + 0.07 + 1e-9; r += dr) {
      const p = pictureFromFace(outer, { x: r * Math.cos(a), y: r * Math.sin(a) });
      // off the shaft: distance from the shaft's line (beyond its tip only the hole matters)
      const vx = p.x - shaft.tip.x, vy = p.y - shaft.tip.y;
      const along = vx * shaft.lean.x + vy * shaft.lean.y;
      const across = Math.abs(-vx * shaft.lean.y + vy * shaft.lean.x);
      if ((along > -3 * s && across < 4 * s) || Math.hypot(vx, vy) < 4 * s) { blocked = true; break; }
      const c = at(p.x, p.y);
      if (!c) { blocked = true; break; }
      rs.push(r); cols.push(c);
    }
    if (blocked) continue;
    const k = Math.round(win / dr);
    let best = null;
    for (let i = k; i < rs.length - k; i++) {
      const mean = (lo, hi) => { const m = [0, 0, 0]; for (let j = lo; j < hi; j++) for (let c = 0; c < 3; c++) m[c] += cols[j][c] / (hi - lo); return m; };
      const inn = mean(i - k, i), out = mean(i + 1, i + 1 + k);
      const step = Math.hypot(inn[0] - out[0], inn[1] - out[1], inn[2] - out[2]);
      const dip = Math.max(0, (bright(inn) + bright(out)) / 2 - bright(cols[i]));
      const score = step + 2 * dip;
      if (!best || score > best.score) best = { r: rs[i], score };
    }
    if (best && best.score > 25) found.push(best.r);
  }
  if (found.length < 3) return null;
  const local = median(found);
  if (Math.abs(local - e) > 0.04) return null;
  return { e, local, n: found.length };
}

/**
 * L: the printed ring line beside the arrow, fitted as a short arc.
 * The ring line nearest the point is either a thin black line between rings of one colour (10/9 in the gold,
 * 8/7 in the red) or a colour step (9/8 gold → red, 7/6 red → blue, the spot's edge blue → white). Strips across
 * the line are read at arc positions of LIN.minMm…LIN.maxMm mm on both sides of the arrow, off the shaft and its
 * hole. In each strip the line is found to 0.1 mm: the deepest thin dip (black line) or the 50 % crossing between
 * the two ring colours (step). A robust straight fit r(a) through those points (a = arc mm) gives the line's
 * radius where the arrow is. Returns { e, local, n, pts } (pts in full px, for the crops) or null.
 */
const LIN = { minMm: 3, maxMm: 20, stepMm: 1, span: 0.04, minPts: 5, ...JSON.parse(process.env.LIN || '{}') };
const KIND = { 0.2: 'line', 0.4: 'step', 0.6: 'line', 0.8: 'step', 1: 'step' };
function localRing(at, outer, f, shaft, s) {
  const d = Math.hypot(f.x, f.y);
  const e = EDGES.reduce((p, q) => (Math.abs(q - d) < Math.abs(p - d) ? q : p));
  if (Math.abs(d - e) > TUNE.near) return null;
  const kind = KIND[e];
  const th = Math.atan2(f.y, f.x);
  const dr = 0.001; // 0.1 mm
  const ref = 0.02; // colour reference: 2 mm just outside the search window
  const keep = shaft.half + 1.5 * s; // stay this far off the shaft and its hole (full px)
  const offShaft = (p) => {
    const vx = p.x - shaft.tip.x, vy = p.y - shaft.tip.y;
    const along = vx * shaft.lean.x + vy * shaft.lean.y;
    const across = Math.abs(-vx * shaft.lean.y + vy * shaft.lean.x);
    return !((along > -keep && across < keep) || Math.hypot(vx, vy) < keep + shaft.half);
  };
  const pts = [];
  for (let side = -1; side <= 1; side += 2)
    for (let mm = LIN.minMm; mm <= LIN.maxMm; mm += LIN.stepMm) {
      const arc = side * mm;
      const phi = th + arc / (e * MM);
      const rs = [], cols = [];
      let ok = true;
      for (let r = e - LIN.span - ref; r <= e + LIN.span + ref + 1e-9; r += dr) {
        const p = pictureFromFace(outer, { x: r * Math.cos(phi), y: r * Math.sin(phi) });
        const c = offShaft(p) ? at(p.x, p.y) : null;
        if (!c) { ok = false; break; }
        rs.push(r); cols.push(c);
      }
      if (!ok) continue;
      const r0 = kind === 'line' ? findDip(rs, cols, e) : findStep(rs, cols, e, ref);
      if (r0 == null) continue;
      pts.push({ arc, r: r0, p: pictureFromFace(outer, { x: r0 * Math.cos(phi), y: r0 * Math.sin(phi) }) });
    }
  if (pts.length < LIN.minPts) return null;
  // robust straight fit r = c0 + c1·arc: fit, drop points far off, fit again
  const fit = (q) => {
    const ma = q.reduce((x, p) => x + p.arc, 0) / q.length, mr = q.reduce((x, p) => x + p.r, 0) / q.length;
    let sxy = 0, sxx = 0;
    for (const p of q) { sxy += (p.arc - ma) * (p.r - mr); sxx += (p.arc - ma) ** 2; }
    const c1 = sxx ? sxy / sxx : 0;
    return { c0: mr - c1 * ma, c1 };
  };
  let q = pts, m = fit(q);
  for (let it = 0; it < 3; it++) {
    const res = q.map((p) => Math.abs(p.r - (m.c0 + m.c1 * p.arc)));
    const mad = median(res);
    const lim = Math.max(0.003, 3 * mad); // never tighter than 0.3 mm
    const nq = q.filter((_, i) => res[i] <= lim);
    if (nq.length === q.length || nq.length < LIN.minPts) break;
    q = nq; m = fit(q);
  }
  if (q.length < LIN.minPts) return null;
  if (Math.abs(m.c0 - e) > LIN.span) return null;
  return { e, local: m.c0, n: q.length, pts: q.map((p) => p.p) };
}

/** A thin black line: the deepest narrow dip in brightness within ±span of e (sub-sample by a parabola). */
function findDip(rs, cols, e) {
  const b = cols.map(bright);
  const sm = b.map((_, i) => (b[Math.max(0, i - 1)] + b[i] + b[Math.min(b.length - 1, i + 1)]) / 3);
  const side = 15; // 1.5 mm each side for the paper's own brightness
  let best = null;
  for (let i = side; i < sm.length - side; i++) {
    if (Math.abs(rs[i] - e) > LIN.span) continue;
    if (!(sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1])) continue;
    const lo = Math.max(...sm.slice(i - side, i - 5)), hi = Math.max(...sm.slice(i + 6, i + side + 1));
    const depth = Math.min(lo, hi) - sm[i];
    if (depth < 25) continue;
    // thin: back to half depth within 1.2 mm on both sides (an old hole is wider)
    const halfLvl = sm[i] + depth / 2;
    let a = i, z = i;
    while (a > i - 12 && sm[a] < halfLvl) a--;
    while (z < i + 12 && sm[z] < halfLvl) z++;
    if (sm[a] < halfLvl || sm[z] < halfLvl) continue;
    if (!best || depth > best.depth) best = { i, depth };
  }
  if (!best) return null;
  const { i } = best;
  const y0 = sm[i - 1], y1 = sm[i], y2 = sm[i + 1];
  const den = y0 - 2 * y1 + y2;
  const off = den > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
  return rs[i] + off * (rs[1] - rs[0]);
}

/** A colour step: where the colour is half way from the inner ring's to the outer ring's, nearest e. */
function findStep(rs, cols, e, ref) {
  const mean = (sel) => { const m = [0, 0, 0]; let n = 0; rs.forEach((r, i) => { if (sel(r)) { for (let c = 0; c < 3; c++) m[c] += cols[i][c]; n++; } }); return m.map((v) => v / n); };
  const inC = mean((r) => r < e - LIN.span);
  const outC = mean((r) => r > e + LIN.span);
  const dv = [outC[0] - inC[0], outC[1] - inC[1], outC[2] - inC[2]];
  const len2 = dv[0] ** 2 + dv[1] ** 2 + dv[2] ** 2;
  if (len2 < 40 ** 2) return null;
  const q = cols.map((c) => ((c[0] - inC[0]) * dv[0] + (c[1] - inC[1]) * dv[1] + (c[2] - inC[2]) * dv[2]) / len2);
  const sm = q.map((_, i) => (q[Math.max(0, i - 1)] + q[i] + q[Math.min(q.length - 1, i + 1)]) / 3);
  // a hole or a black line in the way: much darker than both colours
  const dark = Math.min(bright(inC), bright(outC)) * 0.55;
  if (cols.some((c, i) => Math.abs(rs[i] - e) <= LIN.span && bright(c) < dark)) return null;
  let best = null;
  for (let i = 2; i < sm.length - 2; i++) {
    if (Math.abs(rs[i] - e) > LIN.span) continue;
    if (!((sm[i] - 0.5) * (sm[i + 1] - 0.5) <= 0)) continue;
    const slope = sm[Math.min(sm.length - 1, i + 3)] - sm[Math.max(0, i - 2)];
    if (slope < 0.3) continue; // must rise from inner to outer colour
    const t = sm[i + 1] !== sm[i] ? (0.5 - sm[i]) / (sm[i + 1] - sm[i]) : 0;
    const r = rs[i] + t * (rs[1] - rs[0]);
    if (!best || slope > best.slope) best = { r, slope };
  }
  return best ? best.r : null;
}

const val = (v) => (v === 'X' ? 10 : v === 'M' ? 0 : v);
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, 'meta.json'), 'utf8'));
const VARIANTS = (process.env.VARIANTS || 'base,A+ctr,L,L+cut,A+L,A+L+cut,A+ctr+L,A+ctr+L+cut').split(',');
const tally = Object.fromEntries(VARIANTS.map((v) => [v, 0]));
const rows = [];
for (const [name, m] of Object.entries(meta)) {
  const src = fs.readFileSync(path.join(rawDir, name + '.rgba'));
  const at = sampler(src, m.width, m.height);
  const truth = name.split('_').slice(1).map(Number);
  const look = (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    return { box, scale, res: detectArrows(draw(src, m.width, box, scale), FACE, 3) };
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
  const { box, scale, res } = kept;
  if (res.error) continue;
  const toFull = (p) => ({ x: box.x + p.x / scale, y: box.y + p.y / scale });
  const base = scoresOf(res.arrows, FACE);
  res.arrows.forEach((a, i) => {
    const o = res.spots[a.spot ?? 0].outer;
    const outer = { ...toFull({ x: o.cx, y: o.cy }), rx: o.rx / scale, ry: o.ry / scale, angle: o.angle };
    outer.cx = outer.x; outer.cy = outer.y;
    const s = (outer.rx + outer.ry) / 2 / MM; // full px per mm
    const t = truth[a.spot];
    const tipFull = toFull(a.image);
    const fBase = { x: a.x, y: a.y };
    let A = null;
    if (a.lean) A = refineTip(at, tipFull, a.lean, s);
    const fA = A ? faceFromPicture(outer, A.tip) : fBase;
    const halfFace = A ? A.half / (s * MM) : 0;
    const cut = (f, h) => { const d = Math.hypot(f.x, f.y); const k = d ? Math.max(0, d - h) / d : 1; return { x: f.x * k, y: f.y * k }; };
    const shaft = { tip: A ? A.tip : tipFull, lean: a.lean ?? { x: 0, y: 1 } };
    const withB = (f) => {
      if (!a.lean) return { f, edge: null };
      const edge = localEdge(at, outer, f, shaft, s);
      if (!edge) return { f, edge: null };
      const d = Math.hypot(f.x, f.y);
      const k = d ? (d - (edge.local - edge.e)) / d : 1;
      return { f: { x: f.x * k, y: f.y * k }, edge };
    };
    const bB = withB(fBase), bAB = withB(fA);
    const fC = A && a.lean ? faceFromPicture(outer, { x: A.tip.x + A.half * a.lean.x, y: A.tip.y + A.half * a.lean.y }) : fBase;
    const half = A ? A.half : 2.7 * s;
    const ringFor = (f) => {
      if (!a.lean) return { f, ring: null };
      const ring = localRing(at, outer, f, { tip: A ? A.tip : tipFull, lean: a.lean, half }, s);
      if (!ring) return { f, ring: null };
      const d = Math.hypot(f.x, f.y);
      const k = d ? (d - (ring.local - ring.e)) / d : 1;
      return { f: { x: f.x * k, y: f.y * k }, ring };
    };
    const hf = (+(process.env.CUTK ?? 1)) * half / (s * MM);
    const lB = ringFor(fBase), lC = ringFor(fC), lA = ringFor(fA);
    const pts = { 'A+L': lA.f, 'A+L+cut': cut(lA.f, hf), L: lB.f, 'L+cut': cut(lB.f, hf), 'A+ctr+L': lC.f, 'A+ctr+L+cut': cut(lC.f, hf), 'A+ctr': fC, 'A+ctr+cut': cut(fC, halfFace), base: fBase, A: fA, 'A+cut': cut(fA, halfFace), B: bB.f, 'A+B': bAB.f, 'A+B+cut': cut(bAB.f, halfFace) };
    const row = { photo: name, spot: a.spot, truth: t, kind: a.lean ? 'shaft' : 'blob', refined: !!A, tipMovedMm: A ? +(A.moved / s).toFixed(1) : null, halfMm: A ? +(A.half / s).toFixed(2) : null, edgeMm: lB.ring ? +((lB.ring.local - lB.ring.e) * MM).toFixed(1) : null, ringN: lB.ring ? lB.ring.n : null, ringPts: lB.ring ? lB.ring.pts : [], baseFull: tipFull, d: {}, read: {}, tipFull: A ? A.tip : tipFull, outer };
    for (const v of VARIANTS) {
      const sc = scoreFromPoint(pts[v].x, pts[v].y, FACE);
      row.read[v] = sc;
      row.d[v] = +Math.hypot(pts[v].x, pts[v].y).toFixed(4);
      if (val(sc) === t) tally[v]++;
    }
    if (val(base[i]) !== val(row.read.base)) console.warn('base mismatch', name, i);
    rows.push(row);
  });
}

const SPOT = ['top', 'mid', 'bot'];
console.log(`TUNE ${JSON.stringify(TUNE)}`);
console.log('photo        spot real | ' + VARIANTS.map((v) => v.padStart(7)).join(' ') + ' | tip mm  edge mm');
for (const r of rows) {
  const marks = VARIANTS.map((v) => `${val(r.read[v]) === r.truth ? ' ' : '*'}${String(r.read[v]).padStart(2)} ${(r.d[v] * MM).toFixed(0).padStart(3)}`.padStart(7));
  if (VARIANTS.every((v) => val(r.read[v]) === r.truth)) continue;
  console.log(`${r.photo.padEnd(12)} ${SPOT[r.spot]}  ${String(r.truth).padStart(3)} | ${marks.join(' ')} | ${String(r.tipMovedMm ?? '-').padStart(6)} ${String(r.edgeMm ?? '-').padStart(7)}`);
}
console.log('');
for (const v of VARIANTS) console.log(`${v.padEnd(8)} ${tally[v]}/${rows.length}`);
console.log(`refined tips: ${rows.filter((r) => r.refined).length}/${rows.length}, local rings fitted (L): ${rows.filter((r) => r.edgeMm != null).length}`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ TUNE, tally, rows }, null, 1));

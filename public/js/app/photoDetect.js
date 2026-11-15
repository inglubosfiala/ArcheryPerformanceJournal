// Best-effort arrow detection on a photo of the target (no library, no network, nothing stored).
// Works on RGBA pixels ({ width, height, data } like ImageData), so it can be unit-tested in Node.
//
// 1. Gold: the yellow centre of each spot is found by colour; its shape (centroid and second
//    moments, i.e. a fitted ellipse) gives the spot's centre, size and the camera's tilt.
// 2. Every pixel inside a spot is mapped to face coordinates (spot radius = 1) and compared with
//    the colour the ring there should have. Pixels that do not match (nocks, fletchings, shafts,
//    holes) are grouped into blobs; the biggest blobs are the arrows, at their centroids.
// The result is approximate by design: the archer moves any arrow that landed in the wrong place.
import { isSpotFace, isMultiSpot, spotCentres } from './scoring.js';

/** Colour class of one pixel: 'gold' | 'red' | 'blue' | 'black' | 'white' | 'other'. */
export function colourClass(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.27) return 'black';
  if (s < 0.2) return v > 0.7 ? 'white' : 'other';
  let h;
  const d = max - min;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 38 && h <= 72 && s > 0.4 && v > 0.45) return 'gold';
  if ((h <= 20 || h >= 335) && s > 0.4) return 'red';
  if (h >= 180 && h <= 225 && s > 0.3) return 'blue';
  return 'other';
}

/**
 * Radius of the gold and red together (rings 10 to 7 on a 10–6 spot, 10 to 7 on a full face) in face
 * units: 0.8 on spots, 0.4 on full faces. This filled disc is what a spot is measured by: it is big,
 * so a shaft or a few holes across it barely move its centre or size.
 */
const coreRadius = (face) => (isSpotFace(face) ? 0.8 : 0.4);

/** The colour a face should have at distance `d` from its centre (radius 1), or null near a ring edge. */
export function expectedColour(d, face, margin = 0.05) {
  const edges = isSpotFace(face) ? [0.4, 0.8, 1] : [0.2, 0.4, 0.6, 0.8, 1];
  if (edges.some((e) => Math.abs(d - e) < margin)) return null;
  const zones = isSpotFace(face) ? ['gold', 'red', 'blue'] : ['gold', 'red', 'blue', 'black', 'white'];
  const i = edges.findIndex((e) => d < e);
  return i < 0 ? null : zones[i];
}

/** Connected components (8-neighbour) of a mask; returns [{ area, sx, sy, px: [indices] }]. */
function components(mask, width, height, minArea) {
  const labels = new Int32Array(mask.length);
  const out = [];
  const stack = [];
  let next = 1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    const px = [];
    labels[i] = next;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      px.push(j);
      const x = j % width;
      const y = (j / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const k = yy * width + xx;
          if (mask[k] && !labels[k]) {
            labels[k] = next;
            stack.push(k);
          }
        }
      }
    }
    next++;
    if (px.length >= minArea) out.push({ area: px.length, px });
  }
  return out;
}

/** Ellipse fitted to a filled blob by its moments: centre, semi-axes a ≥ b and the major axis angle. */
function fitEllipse(px, width) {
  let mx = 0;
  let my = 0;
  for (const i of px) {
    mx += i % width;
    my += (i / width) | 0;
  }
  mx /= px.length;
  my /= px.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const i of px) {
    const dx = (i % width) - mx;
    const dy = ((i / width) | 0) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= px.length;
  syy /= px.length;
  sxy /= px.length;
  const tr = (sxx + syy) / 2;
  const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const l1 = tr + det;
  const l2 = Math.max(1e-9, tr - det);
  // a filled ellipse with semi-axes a, b has variance a²/4 and b²/4 along its axes
  return { cx: mx, cy: my, a: 2 * Math.sqrt(l1), b: 2 * Math.sqrt(l2), angle: 0.5 * Math.atan2(2 * sxy, sxx - syy) };
}

/** A spot found in the image: maps image pixels to face coordinates (its radius = 1) and back. */
function makeSpot(e, face) {
  const k = coreRadius(face);
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  const sa = k / e.a; // image px → face units, along the major axis
  const sb = k / e.b; // along the minor axis
  return {
    ...e,
    // image → face: undo the tilt (scale the ellipse's axes to a circle), keep the photo's rotation
    toFace(x, y) {
      const vx = x - e.cx;
      const vy = y - e.cy;
      const u1 = (cos * vx + sin * vy) * sa;
      const u2 = (-sin * vx + cos * vy) * sb;
      return { x: cos * u1 - sin * u2, y: sin * u1 + cos * u2 };
    },
    // the face's outer edge in the image (for the preview)
    outer: { cx: e.cx, cy: e.cy, rx: e.a / k, ry: e.b / k, angle: e.angle },
  };
}

/** Put the found spots in the sheet's order (triple: top to bottom; Vegas: top, bottom left, bottom right). */
function orderSpots(spots, face) {
  if (face === '40t') return [...spots].sort((p, q) => p.cy - q.cy);
  if (face === '40v') {
    const byY = [...spots].sort((p, q) => p.cy - q.cy);
    const [top, ...rest] = byY;
    return [top, ...rest.sort((p, q) => p.cx - q.cx)];
  }
  return spots;
}

/**
 * Detect the face and up to `maxArrows` arrows.
 * Returns { spots, arrows } with arrows [{ x, y, spot, area }] in face units relative to their spot's
 * centre (as stored for logged arrows; `spot` is null on single faces), or { error } when no face
 * was found.
 */
export function detectArrows(img, face, maxArrows, { debug = false, spotHint = 0 } = {}) {
  const { width, height, data } = img;
  const n = width * height;
  const cls = new Array(n);
  const core = new Uint8Array(n);
  const gold = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = colourClass(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    cls[i] = c;
    if (c === 'gold') gold[i] = 1;
    if (c === 'gold' || c === 'red') core[i] = 1;
  }

  const wantSpots = spotCentres(face).length;
  // Each spot's gold + red disc. A shaft lying across it can cut it into pieces: pieces close
  // together are one spot. A red or yellow thing that is not a target has (almost) no gold in it.
  const golds = mergeNearby(components(core, width, height, Math.max(12, n * 0.0004)), width)
    .filter((g) => g.area >= n * 0.004 && g.px.filter((i) => gold[i]).length >= 0.08 * g.area)
    .sort((p, q) => q.area - p.area)
    .slice(0, wantSpots);
  if (!golds.length) return { error: 'Could not find the target face in the photo.' };
  // A photo of a three-spot sheet may show fewer spots (a close-up of one): then only the biggest
  // spot found is used, and its arrows go on the sheet's spot `spotHint`.
  const partial = golds.length < wantSpots;
  const spots = partial
    ? [makeSpot(fitEllipse(golds[0].px, width), face)]
    : orderSpots(
        golds.map((g) => makeSpot(fitEllipse(g.px, width), face)),
        face,
      );

  // pixels that do not have the colour their ring should have
  const odd = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    let best = null;
    for (let s = 0; s < spots.length; s++) {
      const p = spots[s].toFace(x, y);
      const d = Math.hypot(p.x, p.y);
      if (!best || d < best.d) best = { d };
    }
    if (best.d >= 1.02) continue;
    const want = expectedColour(best.d, face);
    // bright white on a coloured ring is glare (light on glossy paper), not an arrow
    if (want && cls[i] !== want && !(cls[i] === 'white' && want !== 'white' && want !== 'black')) odd[i] = 1;
  }
  // close small gaps so a nock, its fletching and the shaft make one blob
  const grown = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!odd[i]) continue;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height) grown[yy * width + xx] = 1;
      }
    }
  }

  const spotPx = spots.reduce((sum, s) => sum + (s.outer.rx + s.outer.ry) / 2, 0) / spots.length; // a spot's radius in px
  // the nearest spot of an image point, and the point relative to its centre (spot radius 1)
  const nearest = (ix, iy) => {
    let best = null;
    spots.forEach((s, k) => {
      const p = s.toFace(ix, iy);
      const d = Math.hypot(p.x, p.y);
      if (!best || d < best.d) best = { d, p, k };
    });
    return best;
  };

  // 1) Shafts seen from the side: long, straight, dark lines over the sheet. Found with a Hough
  //    transform (every dark pixel votes for the lines through it), so old holes (scattered dots)
  //    and the ring lines (curved) do not count. The arrow is at the end of the line inside a face.
  const rejects = debug ? [] : null;
  const shafts = findShafts({ width, height, data, nearest, spotPx, face, odd, rejects });

  // 2) Nocks / fletchings seen head-on: big compact blobs of colour that does not belong to the ring
  //    under it (only used for arrows the shafts did not account for).
  const blobs = [];
  for (const b of components(grown, width, height, Math.max(6, 0.006 * spotPx * spotPx))) {
    const e = fitEllipse(b.px, width);
    // skip blobs that sit on a shaft already found (its fletching or a piece of it)
    if (shafts.some((sh) => distToSegment(e.cx, e.cy, sh.a, sh.b) < 0.12 * spotPx)) continue;
    if (e.a > 2.2 * e.b) {
      // Long: a thin sliver is ring-edge noise. A wide one is a thick shaft in a close-up (often
      // light or coloured, so the dark-line search misses it): the arrow is at its inner end.
      if (2 * e.b < 0.07 * spotPx) continue;
      const cos = Math.cos(e.angle);
      const sin = Math.sin(e.angle);
      let tMin = Infinity;
      let tMax = -Infinity;
      for (const i of b.px) {
        const t = ((i % width) - e.cx) * cos + (((i / width) | 0) - e.cy) * sin;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
      const ends = [tMin, tMax].map((t) => {
        const x = e.cx + t * cos;
        const y = e.cy + t * sin;
        return { x, y, at: nearest(x, y) };
      });
      ends.sort((p, q) => p.at.d - q.at.d);
      if (ends[0].at.d > 0.95 || ends[1].at.d < ends[0].at.d + 0.25) continue;
      blobs.push({ rank: tMax - tMin, image: { x: ends[0].x, y: ends[0].y }, at: ends[0].at, area: b.area });
      continue;
    }
    const at = nearest(e.cx, e.cy);
    blobs.push({ rank: Math.sqrt(b.area), image: { x: e.cx, y: e.cy }, at, area: b.area });
  }

  const candidates = [
    ...shafts.map((sh) => ({ rank: 1e6 + sh.length, image: sh.tip, at: sh.tipAt, area: Math.round(sh.length) })),
    ...blobs,
  ];

  // best first; on a three-spot sheet the best arrow of each spot comes before a second arrow on
  // any spot (one arrow per spot is the usual way to shoot them)
  candidates.sort((p, q) => q.rank - p.rank);
  const firstOfSpot = new Set();
  const ordered = isMultiSpot(face) && !partial
    ? [
        ...candidates.filter((c) => !firstOfSpot.has(c.at.k) && firstOfSpot.add(c.at.k)),
        ...candidates.filter((c, i) => candidates.findIndex((o) => o.at.k === c.at.k) !== i),
      ]
    : candidates;
  const arrows = ordered
    .slice(0, Math.max(0, maxArrows))
    .map((c) => ({
      x: c.at.p.x,
      y: c.at.p.y,
      spot: isMultiSpot(face) ? (partial ? spotHint : c.at.k) : null,
      area: c.area,
      image: c.image,
    }));

  return debug ? { spots, arrows, partial, debug: { odd, grown, shafts, blobs, rejects } } : { spots, arrows, partial };
}

/** Merge blobs whose centres are close (pieces of one gold cut apart by a shaft). */
function mergeNearby(blobs, width) {
  const groups = [];
  for (const b of [...blobs].sort((p, q) => q.area - p.area)) {
    let sx = 0;
    let sy = 0;
    for (const i of b.px) {
      sx += i % width;
      sy += (i / width) | 0;
    }
    const c = { x: sx / b.area, y: sy / b.area };
    const home = groups.find((g) => Math.hypot(g.c.x - c.x, g.c.y - c.y) < 1.3 * Math.sqrt(g.area / Math.PI));
    if (home) {
      home.px = home.px.concat(b.px);
      home.c = { x: (home.c.x * home.area + c.x * b.area) / (home.area + b.area), y: (home.c.y * home.area + c.y * b.area) / (home.area + b.area) };
      home.area += b.area;
    } else groups.push({ px: b.px, area: b.area, c });
  }
  return groups;
}

/** Distance from point (x, y) to the segment a–b (image px). */
function distToSegment(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * Arrow shafts as straight dark lines near the spots. Returns [{ a, b, length, tip, tipAt }]: the
 * dark run along the line (a–b) and its end inside a face (the arrow's entry point).
 */
function findShafts({ width, height, data, nearest, spotPx, face, odd, rejects = null }) {
  // dark pixels on or around the faces (the sheet), but not on a full face's black rings
  const isDarkPx = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= 125;
  // A shaft is thin: a dark pixel only counts when the dark run through it is short across (in x
  // or in y). That drops big dark areas (a table or wall behind the sheet, shadows).
  const maxThick = Math.max(6, Math.round(0.16 * spotPx));
  const thinAt = (x, y) => {
    let w = 1;
    for (let xx = x - 1; xx >= 0 && w <= maxThick && isDarkPx(y * width + xx); xx--) w++;
    for (let xx = x + 1; xx < width && w <= maxThick && isDarkPx(y * width + xx); xx++) w++;
    if (w <= maxThick) return true;
    let hgt = 1;
    for (let yy = y - 1; yy >= 0 && hgt <= maxThick && isDarkPx(yy * width + x); yy--) hgt++;
    for (let yy = y + 1; yy < height && hgt <= maxThick && isDarkPx(yy * width + x); yy++) hgt++;
    return hgt <= maxThick;
  };
  const dark = new Uint8Array(width * height);
  const pts = [];
  for (let i = 0; i < width * height; i++) {
    if (!isDarkPx(i)) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const at = nearest(x, y);
    if (at.d > 1.12) continue; // stay on the faces: what is behind the sheet is full of lines
    if (!isSpotFace(face) && at.d > 0.58 && at.d < 0.82) continue;
    if (!thinAt(x, y)) continue;
    dark[i] = 1;
    pts.push(x, y);
  }
  if (pts.length < 4) return [];

  // Hough accumulator: angle in 1° steps, distance from the origin in 1 px steps
  const T = 180;
  const D = Math.ceil(Math.hypot(width, height));
  const acc = new Int32Array(T * (2 * D + 1));
  const cosT = new Float64Array(T);
  const sinT = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    cosT[t] = Math.cos((t * Math.PI) / T);
    sinT[t] = Math.sin((t * Math.PI) / T);
  }
  for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k];
    const y = pts[k + 1];
    for (let t = 0; t < T; t++) acc[t * (2 * D + 1) + Math.round(x * cosT[t] + y * sinT[t]) + D]++;
  }

  const isDark = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const xx = xi + ox;
        const yy = yi + oy;
        // dark, or not the ring's colour: a shaft is often lighter near its point
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && (dark[yy * width + xx] || odd[yy * width + xx])) return true;
      }
    }
    return false;
  };

  const blackZone = (x, y) => {
    if (isSpotFace(face)) return false;
    const d = nearest(x, y).d;
    return d > 0.56 && d < 0.84;
  };

  const minRun = 0.45 * spotPx;
  const found = [];
  for (let tries = 0; tries < 120 && found.length < 12; tries++) {
    // strongest remaining line
    let best = -1;
    let bestV = 0;
    for (let j = 0; j < acc.length; j++) {
      if (acc[j] > bestV) {
        bestV = acc[j];
        best = j;
      }
    }
    if (bestV < minRun * 0.6) break;
    const t = Math.floor(best / (2 * D + 1));
    const rho = (best % (2 * D + 1)) - D;
    // suppress this line and its near neighbours
    for (let dt = -4; dt <= 4; dt++) {
      const tt = (t + dt + T) % T;
      for (let dr = -6; dr <= 6; dr++) {
        const rr = rho + dr + D;
        if (rr >= 0 && rr <= 2 * D) acc[tt * (2 * D + 1) + rr] = 0;
      }
    }
    // walk along the line and take its longest dark run (gaps of a few px allowed)
    const c = cosT[t];
    const sn = sinT[t];
    const x0 = rho * c;
    const y0 = rho * sn;
    let run = null;
    let cur = null;
    let gap = 0;
    for (let u = -D; u <= D; u++) {
      const x = x0 - u * sn;
      const y = y0 + u * c;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (isDark(x, y)) {
        if (!cur) cur = { u0: u, u1: u };
        cur.u1 = u;
        gap = 0;
      } else if (cur && blackZone(x, y)) {
        // a dark shaft cannot be seen on a full face's black rings: the line carries on across them
      } else if (cur) {
        gap++;
        if (gap > 5) {
          if (!run || cur.u1 - cur.u0 > run.u1 - run.u0) run = cur;
          cur = null;
          gap = 0;
        }
      }
    }
    if (cur && (!run || cur.u1 - cur.u0 > run.u1 - run.u0)) run = cur;
    if (!run || run.u1 - run.u0 < minRun) {
      rejects?.push({ why: 'short', votes: bestV, t, rho, run: run ? run.u1 - run.u0 : 0 });
      continue;
    }
    const a = { x: x0 - run.u0 * sn, y: y0 + run.u0 * c };
    const b = { x: x0 - run.u1 * sn, y: y0 + run.u1 * c };
    const atA = nearest(a.x, a.y);
    const atB = nearest(b.x, b.y);
    // the entry point is the end inside a face; the other end leans out (towards the camera)
    const [tip, tipAt, out] = atA.d <= atB.d ? [a, atA, atB] : [b, atB, atA];
    if (tipAt.d > 0.95 || out.d < tipAt.d + 0.25) {
      rejects?.push({ why: 'ends', votes: bestV, t, rho, tip: +tipAt.d.toFixed(2), out: +out.d.toFixed(2), a, b });
      continue;
    }
    // one arrow per shaft: another line along the same shaft (nearly the same direction, and this
    // tip lies on it) is the same arrow; the tip further into the face is kept
    const line = { a, b, length: run.u1 - run.u0, tip, tipAt, t };
    const same = found.findIndex((f) => {
      const da = Math.min(Math.abs(f.t - t), T - Math.abs(f.t - t));
      return da <= 12 && (distToSegment(tip.x, tip.y, f.a, f.b) < 0.15 * spotPx || Math.hypot(f.tip.x - tip.x, f.tip.y - tip.y) < 0.3 * spotPx);
    });
    if (same >= 0) {
      if (tipAt.d < found[same].tipAt.d) found[same] = { ...line, length: Math.max(line.length, found[same].length) };
      continue;
    }
    found.push(line);
  }
  return found;
}

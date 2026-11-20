// Family-aware anchor detection for circular paper faces. Pure pixels in, ellipses out.
// Uses a known centre disc or annulus, then verifies the surrounding palette before accepting it.
import { colourBands } from './scoring.js';

export function targetAnchor(face) {
  const [first, second, third] = colourBands(face);
  // Bright centres form discs; black/white/black faces provide a larger white annulus.
  // A reduced black/white Flint centre instead uses its enclosed black disc.
  if (first.zone === 'black' && second?.zone === 'white' && third?.zone === 'black') {
    return { zone: 'white', inner: first.edge, outer: second.edge };
  }
  return { zone: first.zone, inner: 0, outer: first.edge };
}

export function targetColour(r, g, b, face) {
  const available = Array.isArray(face) ? face : colourBands(face).map((band) => band.zone);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  const delta = max - min;
  let hue = delta
    ? max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4
    : 0;
  hue = (hue * 60 + 360) % 360;
  if (available.includes('navy') && saturation > 0.25 && hue >= 180 && hue <= 265) return 'navy';
  if (available.includes('teal') && saturation > 0.25 && hue >= 160 && hue <= 210 && max > 45) return 'teal';
  if (max < 85) return 'black';
  if (saturation < 0.25) return max > 155 ? 'white' : 'other';
  if (hue >= 38 && hue <= 75 && saturation > 0.4 && max > 110) return 'gold';
  return 'other';
}

/** Correct filled-ellipse moments for an annulus: variance is (outer² + inner²)/4. */
export function anchorEllipse(ellipse, anchor) {
  const k = anchor.outer / Math.hypot(anchor.outer, anchor.inner);
  return { ...ellipse, a: ellipse.a * k, b: ellipse.b * k };
}

/** Sample every colour band, excluding ring lines and allowing some shaft/hole occlusion. */
export function matchesTarget(ellipse, anchor, img, classes, face) {
  const { width, height } = img;
  const rx = ellipse.a / anchor.outer;
  const ry = ellipse.b / anchor.outer;
  if (Math.min(rx, ry) < 12 || Math.max(rx, ry) > Math.max(width, height) || ellipse.a / ellipse.b > 3.5)
    return false;
  const cos = Math.cos(ellipse.angle),
    sin = Math.sin(ellipse.angle);
  let inner = 0;
  for (const band of colourBands(face)) {
    let seen = 0,
      matches = 0;
    for (const fraction of [0.35, 0.7]) {
      const r = inner + (band.edge - inner) * fraction;
      for (let j = 0; j < 24; j++) {
        const t = ((j + 0.25) * Math.PI) / 12;
        const x = Math.round(ellipse.cx + cos * rx * r * Math.cos(t) - sin * ry * r * Math.sin(t));
        const y = Math.round(ellipse.cy + sin * rx * r * Math.cos(t) + cos * ry * r * Math.sin(t));
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        seen++;
        if (classes[y * width + x] === band.zone) matches++;
      }
    }
    if (seen < 24 || matches / seen < 0.62) return false;
    inner = band.edge;
  }
  // A dark scoring face must end near the predicted outer edge. Otherwise a small inner
  // disc can fit the wrong profile (for example a 40 cm indoor face mistaken for a 16 cm spot).
  const outsideInk = colourBands(face).at(-1).zone;
  if (outsideInk !== 'white') {
    let seen = 0,
      background = 0;
    for (let j = 0; j < 24; j++) {
      const t = ((j + 0.25) * Math.PI) / 12;
      const x = Math.round(ellipse.cx + cos * rx * 1.12 * Math.cos(t) - sin * ry * 1.12 * Math.sin(t));
      const y = Math.round(ellipse.cy + sin * rx * 1.12 * Math.cos(t) + cos * ry * 1.12 * Math.sin(t));
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      seen++;
      if (classes[y * width + x] !== outsideInk) background++;
    }
    if (seen < 12 || background / seen < 0.6) return false;
  }
  return true;
}

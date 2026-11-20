import { describe, it, expect } from 'vitest';
import { createSteadyReading } from '../public/js/app/scan.js';
import { createMultiViewReading } from '../public/js/app/multiViewScan.js';
import { detectArrows } from '../public/js/app/photoDetect.js';
import { targetAnchor, targetColour } from '../public/js/app/targetDetect.js';
import {
  FACE_IDS,
  spotCentres,
  colourBands,
  ringEdges,
  TARGET_COLOURS,
  scoreFromPoint,
  cameraSupported,
  scoringProfile,
} from '../public/js/app/scoring.js';
import { EXTRA_FACES } from '../public/js/app/targetCatalog.js';

const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((s) => parseInt(s, 16));
function photo(
  face,
  { arrows = true, tilt = 0.9, lines = false, light = 1, missing = -1, shaft = false, points = null } = {},
) {
  const centres = spotCentres(face).map(([x, y]) => [x / 100, y / 100]);
  const xs = centres.map(([x]) => x),
    ys = centres.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs),
    spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(130, 480 / (Math.max(spanX, spanY) + 2.8));
  const width = Math.ceil((spanX + 2.8) * scale),
    height = Math.ceil((spanY + 2.8) * scale);
  const data = new Uint8ClampedArray(width * height * 4);
  const point = scoringProfile(face) ? { x: 0.35, y: 0.13 } : { x: 0.25, y: 0.1 };
  const bands = colourBands(face);
  const edges = ringEdges(face);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = (x - width / 2) / (scale * tilt),
        sy = (y - height / 2) / scale;
      let colour = [190, 186, 182];
      for (const [index, [cx, cy]] of centres.entries()) {
        if (index === missing) continue;
        const px = sx - cx,
          py = sy - cy,
          d = Math.hypot(px, py);
        const band = bands.find((b) => d < b.edge);
        if (!band) continue;
        colour = rgb(TARGET_COLOURS[band.zone]);
        if (lines && edges.some((edge) => Math.abs(d - edge) < 0.006))
          colour = band.zone === 'white' || band.zone === 'gold' ? [15, 15, 15] : [240, 240, 240];
        if (arrows && (points || [point]).some((p) => Math.hypot(px - p.x, py - p.y) < 0.055))
          colour = [60, 220, 90];
        if (arrows && shaft && px >= point.x && px <= 0.9 && Math.abs(py - point.y) < 0.02)
          colour = [8, 8, 8];
      }
      const i = (y * width + x) * 4;
      data[i] = colour[0] * light;
      data[i + 1] = colour[1] * light;
      data[i + 2] = colour[2] * light;
      data[i + 3] = 255;
    }
  return { width, height, data, truth: point };
}

describe('camera detection across all circular target families', () => {
  it.each(FACE_IDS)('finds the spots and arrows of %s', (face) => {
    const expected = spotCentres(face).length;
    const img = photo(face);
    const result = detectArrows(img, face, expected);
    expect(result.error, face).toBeUndefined();
    expect(result.partial, face).toBe(false);
    expect(result.spots, face).toHaveLength(expected);
    expect(result.arrows, face).toHaveLength(expected);
    result.arrows.forEach((arrow, i) => {
      expect(arrow.spot, face).toBe(expected > 1 ? i : null);
      expect(Math.hypot(arrow.x - img.truth.x, arrow.y - img.truth.y), `${face}: arrow ${i}`).toBeLessThan(
        0.07,
      );
      expect(scoreFromPoint(arrow.x, arrow.y, face), face).toBe(
        scoreFromPoint(img.truth.x, img.truth.y, face),
      );
    });
  });

  it.each([
    'wa-field-black-single-40',
    'wa-field-teal-single-40',
    'ifaa-field-standard-single-35',
    'ifaa-hunter-standard-single-35',
    'ifaa-expert-standard-single-50',
    'ifaa-indoor-blue-single-40',
    'ifaa-indoor-blue-five-16',
    'ifaa-flint-centre-four-21',
  ])('finds %s despite printed lines and mild tilt', (face) => {
    const result = detectArrows(photo(face, { tilt: 0.75, lines: true }), face, spotCentres(face).length);
    expect(result.error, face).toBeUndefined();
    expect(result.partial, face).toBe(false);
    expect(result.arrows, face).toHaveLength(spotCentres(face).length);
  });

  it.each([
    'wa-field-black-single-40',
    'wa-field-teal-single-40',
    'ifaa-field-standard-single-35',
    'ifaa-hunter-standard-single-35',
    'ifaa-indoor-blue-single-40',
  ])('does not invent arrows on a clean %s', (face) => {
    const result = detectArrows(photo(face, { arrows: false, lines: true }), face, 3);
    expect(result.error).toBeUndefined();
    expect(result.arrows).toHaveLength(0);
  });

  it.each([
    'wa-field-teal-single-40',
    'ifaa-field-standard-single-35',
    'ifaa-hunter-standard-single-35',
    'ifaa-indoor-blue-single-40',
  ])('detects a side-on shaft on %s', (face) => {
    const result = detectArrows(photo(face, { shaft: true }), face, 1);
    expect(result.error).toBeUndefined();
    expect(result.arrows).toHaveLength(1);
    expect(Math.hypot(result.arrows[0].x - 0.35, result.arrows[0].y - 0.13)).toBeLessThan(0.1);
  });

  it.each(['wa-field-teal-single-40', 'ifaa-field-standard-single-35', 'ifaa-indoor-blue-five-16'])(
    'handles moderately reduced light on %s',
    (face) => {
      const result = detectArrows(photo(face, { light: 0.8 }), face, spotCentres(face).length);
      expect(result.error).toBeUndefined();
      expect(result.arrows).toHaveLength(spotCentres(face).length);
    },
  );

  it.each(['wa-field-teal-triple-20', 'ifaa-expert-standard-four-20', 'ifaa-indoor-blue-five-16'])(
    'supports steady and multi-view capture with real detections of %s',
    (face) => {
      const maxArrows = spotCentres(face).length;
      const steady = createSteadyReading({ face, maxArrows });
      const multi = createMultiViewReading({ face, maxArrows });
      let stable, sweep;
      for (let i = 0; i < 5; i++) {
        const res = detectArrows(photo(face, { tilt: 0.96 - i * 0.06 }), face, maxArrows);
        expect(res.error).toBeUndefined();
        stable = steady.read(res, i * 400);
        sweep = multi.read(res, i * 400);
      }
      expect(stable.locked).toBe(true);
      expect(sweep.locked).toBe(true);
      expect(multi.take().arrows).toHaveLength(maxArrows);
    },
  );

  it('reads four arrows on a single IFAA field face', () => {
    const points = [
      { x: 0.35, y: 0.13 },
      { x: -0.35, y: 0.13 },
      { x: 0.13, y: 0.35 },
      { x: 0.13, y: -0.35 },
    ];
    const face = 'ifaa-field-standard-single-35';
    const res = detectArrows(photo(face, { points }), face, 4);
    expect(res.error).toBeUndefined();
    expect(res.arrows).toHaveLength(4);
    for (const point of points)
      expect(res.arrows.some((a) => Math.hypot(a.x - point.x, a.y - point.y) < 0.08)).toBe(true);
  });

  it('uses a partial five-spot view only for the hinted spot', () => {
    const original = photo('ifaa-indoor-blue-five-16');
    const width = 180,
      height = 180,
      data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      data.set(
        original.data.subarray(y * original.width * 4, y * original.width * 4 + width * 4),
        y * width * 4,
      );
    const result = detectArrows({ width, height, data }, 'ifaa-indoor-blue-five-16', 5, { spotHint: 4 });
    expect(result.error).toBeUndefined();
    expect(result.partial).toBe(true);
    expect(result.arrows).toHaveLength(1);
    expect(result.arrows.every((a) => a.spot === 4)).toBe(true);
  });

  it('rejects a blank image and a lone white disc without the required surrounding rings', () => {
    const width = 300,
      height = 300;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (const face of Object.keys(EXTRA_FACES))
      expect(detectArrows({ width, height, data }, face, 3).error, face).toBeTruthy();
    const img = photo('ifaa-indoor-blue-single-40');
    expect(detectArrows(img, 'ifaa-field-standard-single-35', 1).error).toBeTruthy();
    expect(detectArrows(img, 'ifaa-indoor-blue-five-16', 5).error).toBeTruthy();
  });

  it('classifies each new palette without confusing green nocks with target ink', () => {
    for (const face of Object.keys(EXTRA_FACES)) {
      for (const band of colourBands(face))
        expect(targetColour(...rgb(TARGET_COLOURS[band.zone]), face)).toBe(band.zone);
      expect(targetColour(60, 220, 90, face)).toBe('other');
      expect(targetAnchor(face).outer).toBeGreaterThan(0);
    }
    expect(FACE_IDS.every(cameraSupported)).toBe(true);
  });
});

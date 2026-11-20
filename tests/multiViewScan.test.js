import { describe, it, expect } from 'vitest';
import { createMultiViewReading } from '../public/js/app/multiViewScan.js';
import { pictureFromFace } from '../public/js/app/scanGeometry.js';

const outer = { cx: 200, cy: 250, rx: 100, ry: 90, angle: 0 };
function frame(angle = 0, x = 0.2, extra = {}) {
  return {
    partial: false,
    spots: [{ outer }],
    arrows: [
      {
        x,
        y: 0.1,
        spot: null,
        image: pictureFromFace(outer, { x, y: 0.1 }),
        lean: { x: Math.cos(angle), y: Math.sin(angle) },
      },
    ],
    ...extra,
  };
}
const reader = () => createMultiViewReading({ face: '122', maxArrows: 1 });
const collect = (r, count = 3) => {
  let state;
  for (let i = 0; i < count; i++) state = r.read(frame(i * 0.12), i * 400);
  return state;
};

describe('experimental multi-view reading', () => {
  it('requires three distinct observations before review and five for automatic review', () => {
    const r = reader();
    expect(r.read(frame(), 0)).toMatchObject({ count: 1, canTake: false, locked: false });
    expect(r.take()).toBeNull();
    expect(r.read(frame(0.12), 400)).toMatchObject({ count: 2, canTake: false });
    expect(r.read(frame(0.24), 800)).toMatchObject({ count: 3, canTake: true, locked: false });
    expect(r.read(frame(0.36), 1200).locked).toBe(false);
    expect(r.read(frame(0.48), 1600)).toMatchObject({ count: 5, locked: true, progress: 1 });
    expect(r.read(frame(0.6), 2000).count).toBe(5);
  });

  it('does not count identical or too rapidly sampled views', () => {
    const r = reader();
    r.read(frame(), 0);
    expect(r.read(frame(0.2), 100).count).toBe(1);
    expect(r.read(frame(), 400)).toMatchObject({ count: 1, accepted: false });
    expect(r.read(frame(0.2), 800).count).toBe(2);
    expect(r.read(frame(), 1200).count).toBe(2); // returning to a previous angle does not count
  });

  it('ignores pure crop translation and scale changes', () => {
    const r = reader();
    r.read(frame(), 0);
    const res = frame();
    res.spots = [{ outer: { ...outer, cx: 800, cy: 900, rx: 200, ry: 180 } }];
    expect(r.read(res, 500).count).toBe(1);
  });

  it('uses median positions to resist an outlying impact estimate', () => {
    const r = reader();
    r.read(frame(0, 0.2), 0);
    r.read(frame(0.12, 0.34), 400);
    r.read(frame(0.24, 0.21), 800);
    expect(r.take().arrows[0].x).toBe(0.21);
    expect(r.take().arrows[0].image).toEqual(pictureFromFace(outer, { x: 0.21, y: 0.1 }));
  });

  it('matches reordered arrows by position and spot before combining them', () => {
    const r = createMultiViewReading({ face: '122', maxArrows: 2 });
    for (let i = 0; i < 3; i++) {
      const res = frame(i * 0.12);
      res.arrows.push({ ...res.arrows[0], x: -0.5 });
      if (i === 1) res.arrows.reverse();
      r.read(res, i * 400);
    }
    expect(r.take().arrows.map((a) => a.x)).toEqual([0.2, -0.5]);
  });

  it('rejects ambiguous close arrows and mismatched arrows', () => {
    const r = reader();
    r.read(frame(), 0);
    expect(r.read(frame(0.2, -0.6), 400).count).toBe(1);
    const two = createMultiViewReading({ face: '122', maxArrows: 2 });
    const res = frame();
    res.arrows.push({ ...res.arrows[0], x: 0.24 });
    expect(two.read(res, 0).count).toBe(0);
  });

  it('never collects errors, partial sheets, missing arrows or non-finite positions', () => {
    const r = reader();
    for (const res of [
      { error: 'lost' },
      frame(0, 0.2, { partial: true }),
      frame(0, 0.2, { arrows: [] }),
      frame(0, NaN),
    ]) {
      expect(r.read(res, 1000).count).toBe(0);
    }
    const triple = createMultiViewReading({ face: '40t', maxArrows: 3 });
    expect(triple.read(frame(), 0).count).toBe(0);
  });

  it('preserves the accepted preview through target loss and rejects later mismatched frames', () => {
    const r = reader();
    collect(r);
    const preview = r.take();
    expect(r.read({ error: 'lost' }, 1600)).toMatchObject({ canTake: true, accepted: false, locked: false });
    expect(r.read(frame(0.6, -0.6), 2000)).toMatchObject({ accepted: false, locked: false });
    expect(r.take()).toEqual(preview);
  });

  it('reset clears the fused result and allows a fresh target immediately', () => {
    const r = reader();
    collect(r);
    r.reset();
    expect(r.take()).toBeNull();
    expect(r.read(frame(0, -0.6), 801)).toMatchObject({ count: 1, canTake: false });
  });
});

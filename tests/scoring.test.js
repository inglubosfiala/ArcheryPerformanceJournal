import { describe, it, expect } from 'vitest';
import {
  scoreFromPoint,
  arrowValue,
  keypadValues,
  quickKeys,
  zoneOf,
  DISTANCE_DEFAULTS,
  DISTANCES,
  locateOnSheet,
  sheetPoint,
  faceLabel,
  colourBands,
  withCompound,
  isCompoundFace,
  SETUP_FACES,
  FACE_IDS,
  REPLACED_FACES,
} from '../public/js/app/scoring.js';

describe('scoreFromPoint – full face', () => {
  const f = '122';
  it.each([
    [0, 0, 'X'],
    [0.05, 0, 'X'],
    [0.0501, 0, 10],
    [0.0999, 0, 10],
    [0.1, 0, 9], // on the line → lower ring
    [0.15, 0, 9],
    [0.2, 0, 8],
    [0.3, 0, 7],
    [0.55, 0, 5],
    [0.7, 0, 3],
    [0.9, 0, 1],
    [0.999, 0, 1],
    [1, 0, 'M'],
    [0.8, 0.8, 'M'],
  ])('(%f, %f) → %s', (x, y, expected) => {
    expect(scoreFromPoint(x, y, f)).toBe(expected);
  });

  it('uses radial distance in any direction', () => {
    expect(scoreFromPoint(0, -0.35, f)).toBe(7);
    expect(scoreFromPoint(0.3, 0.4, f)).toBe(5); // d = 0.5 → line → lower
  });
});

describe('scoreFromPoint – 40 cm 10–6 face', () => {
  const f = '40s';
  it.each([
    [0, 0, 'X'],
    [0.1, 0, 'X'],
    [0.1001, 0, 10],
    [0.19, 0, 10],
    [0.2, 0, 9],
    [0.4, 0, 8],
    [0.6, 0, 7],
    [0.8, 0, 6],
    [0.99, 0, 6],
    [1, 0, 'M'],
  ])('(%f, %f) → %s', (x, y, expected) => {
    expect(scoreFromPoint(x, y, f)).toBe(expected);
  });
});

describe('helpers', () => {
  it('arrowValue maps X to 10, M and empty to 0', () => {
    expect(arrowValue('X')).toBe(10);
    expect(arrowValue('M')).toBe(0);
    expect(arrowValue(null)).toBe(0);
    expect(arrowValue(7)).toBe(7);
  });
  it('keypad shows only 6–10 on the spot face', () => {
    expect(keypadValues('40s')).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
    // the reduced 60 / 80 cm faces are scored the same way: 10-6, a miss outside the blue
    for (const face of ['60s', '80s']) {
      expect(keypadValues(face)).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
      expect(scoreFromPoint(0.05, 0, face)).toBe('X');
      expect(scoreFromPoint(0.5, 0, face)).toBe(8);
      expect(scoreFromPoint(0.9, 0, face)).toBe(6);
      expect(scoreFromPoint(1.05, 0, face)).toBe('M');
    }
    expect(faceLabel('60s')).toBe('60 cm 10–6');
    expect(faceLabel('80s')).toBe('80 cm 10–6');
    expect(keypadValues('122')).toHaveLength(12);
  });
  it('zones follow WA colours', () => {
    expect([zoneOf('X'), zoneOf(8), zoneOf(5), zoneOf(3), zoneOf(1), zoneOf('M'), zoneOf(null)]).toEqual([
      'gold', 'red', 'blue', 'black', 'white', 'miss', 'empty',
    ]);
  });
  it('distance defaults', () => {
    expect(DISTANCE_DEFAULTS[18]).toEqual({ face: '40t' });
    expect(DISTANCE_DEFAULTS[70]).toEqual({ face: '122' });
  });
});

describe('three-spot sheets', () => {
  it('finds the nearest spot and the position relative to its centre', () => {
    const top = locateOnSheet(0.05, -2.2, '40t');
    expect(top.spot).toBe(0);
    expect(top.x).toBeCloseTo(0.05);
    expect(top.y).toBeCloseTo(0);
    expect(locateOnSheet(0, 0.3, '40t').spot).toBe(1);
    expect(locateOnSheet(0, 2.5, '40t').spot).toBe(2);
    expect(locateOnSheet(-1.1, 0.63, '40v')).toMatchObject({ spot: 1 });
    expect(locateOnSheet(1.2, 0.6, '40v').spot).toBe(2);
  });

  it('keeps single faces without a spot', () => {
    expect(locateOnSheet(0.2, 0.1, '122')).toEqual({ spot: null, x: 0.2, y: 0.1 });
  });

  it('scores each spot like a 40 cm 10–6 face', () => {
    const hit = locateOnSheet(0, -2.2 + 0.5, '40t');
    expect(scoreFromPoint(hit.x, hit.y, '40t')).toBe(8);
    expect(keypadValues('40v')).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
  });

  it('places a logged arrow back on its spot', () => {
    expect(sheetPoint({ x: 0.1, y: 0, spot: 2 }, '40v')).toEqual({ x: 120, y: 63 });
    expect(sheetPoint({ x: 0.1, y: 0.2 }, '122')).toEqual({ x: 10, y: 20 });
  });
});

describe('compound inner 10 (WA Book 2 7.2.2.3)', () => {
  it('scores only the X ring as 10 and the rest of the gold as 9 on a 40 cm triple', () => {
    const f = '40tc';
    expect(scoreFromPoint(0, 0, f)).toBe(10);
    expect(scoreFromPoint(0.1, 0, f)).toBe(10); // on the inner 10 line
    expect(scoreFromPoint(0.15, 0, f)).toBe(9); // the outer 10 ring
    expect(scoreFromPoint(0.3, 0, f)).toBe(9); // the 9 ring
    expect(scoreFromPoint(0.4, 0, f)).toBe(8);
    expect(scoreFromPoint(0.9, 0, f)).toBe(6);
    expect(scoreFromPoint(1, 0, f)).toBe('M');
    expect(keypadValues(f)).toEqual([10, 9, 8, 7, 6, 'M']);
  });

  it('scores a full 40 / 60 cm face the same way, down to 1', () => {
    for (const f of ['40c', '60c']) {
      expect(scoreFromPoint(0.03, 0, f)).toBe(10);
      expect(scoreFromPoint(0.08, 0, f)).toBe(9);
      expect(scoreFromPoint(0.18, 0, f)).toBe(9);
      expect(scoreFromPoint(0.25, 0, f)).toBe(8);
      expect(scoreFromPoint(0.95, 0, f)).toBe(1);
      expect(keypadValues(f)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M']);
    }
  });

  it('is a version of the indoor faces only', () => {
    expect(withCompound('40t', true)).toBe('40tc');
    expect(withCompound('40tc', false)).toBe('40t');
    expect(withCompound('122', true)).toBe('122');
    expect(withCompound('80r', true)).toBe('80r');
    expect(isCompoundFace('60sc')).toBe(true);
    expect(isCompoundFace('60s')).toBe(false);
    expect(faceLabel('40tc')).toBe('40 cm triple · compound');
    expect(quickKeys('40tc')).toEqual([10, 9, 8, 7, 6, 'M']);
  });
});

describe('WA 80 cm 6-ring face', () => {
  it('scores 10 down to 5 with the X half a ring wide', () => {
    const f = '80r';
    expect(scoreFromPoint(1 / 12, 0, f)).toBe('X');
    expect(scoreFromPoint(0.1, 0, f)).toBe(10);
    expect(scoreFromPoint(0.5, 0, f)).toBe(7);
    expect(scoreFromPoint(0.9, 0, f)).toBe(5);
    expect(scoreFromPoint(1, 0, f)).toBe('M');
    expect(keypadValues(f)).toEqual(['X', 10, 9, 8, 7, 6, 5, 'M']);
    expect(quickKeys(f)).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
    expect(faceLabel(f)).toBe('80 cm 10–5');
    expect(colourBands(f).map((b) => b.zone)).toEqual(['gold', 'red', 'blue']);
  });

  it('replaces the old 80 cm 10–6 face for new sessions, which stays valid for old ones', () => {
    expect(SETUP_FACES).toContain('80r');
    expect(SETUP_FACES).not.toContain('80s');
    expect(FACE_IDS).toContain('80s');
    expect(REPLACED_FACES['80s']).toBe('80r');
    expect(scoreFromPoint(0.9, 0, '80s')).toBe(6);
  });
});

describe('face data', () => {
  it('colour bands follow the printed rings', () => {
    expect(colourBands('122')).toEqual([
      { zone: 'gold', edge: 0.2 },
      { zone: 'red', edge: 0.4 },
      { zone: 'blue', edge: 0.6 },
      { zone: 'black', edge: 0.8 },
      { zone: 'white', edge: 1 },
    ]);
    expect(colourBands('40t')).toEqual([
      { zone: 'gold', edge: 0.4 },
      { zone: 'red', edge: 0.8 },
      { zone: 'blue', edge: 1 },
    ]);
  });

  it('has the 60 cm triple and Vegas sheets and the 40 / 90 m distances', () => {
    expect(locateOnSheet(0, 2.3, '60t').spot).toBe(2);
    expect(faceLabel('60v')).toBe('60 cm Vegas');
    expect(DISTANCES).toEqual([7, 18, 25, 30, 40, 50, 60, 70, 90]);
    expect(DISTANCE_DEFAULTS[90]).toEqual({ face: '122' });
  });
});

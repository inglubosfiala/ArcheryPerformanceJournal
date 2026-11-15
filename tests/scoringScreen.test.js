import { describe, it, expect } from 'vitest';
import * as L from '../public/js/app/sessionLogic.js';
import { suggestedSpot } from '../public/js/app/scoring.js';

const start = (n = 3, face = '40t') => L.createSession({ date: '2026-11-15', distance: 18, face, arrowsPerEnd: n });
const arrows = (...spots) =>
  spots.map((spot) => (spot === null ? L.emptyArrow() : { ...L.emptyArrow(), v: 9, x: 0.1, y: 0.1, spot }));

describe('suggestedSpot – the hint for the selected arrow on a triple or Vegas sheet', () => {
  it('slot n suggests spot n', () => {
    expect(suggestedSpot('40t', arrows(null, null, null), 0)).toBe(0);
    expect(suggestedSpot('40t', arrows(0, null, null), 1)).toBe(1);
    expect(suggestedSpot('40v', arrows(0, 1, null), 2)).toBe(2);
  });

  it('spot n already used in this end → the first spot not yet used', () => {
    // arrow 1 was shot at spot 2 (index 1); arrow 2 is suggested spot 1 (index 0)
    expect(suggestedSpot('40t', arrows(1, null, null), 1)).toBe(0);
  });

  it('a slot past the spots (6 arrows on 3 spots) takes the first unused one, else wraps', () => {
    expect(suggestedSpot('40t', arrows(0, 1, null, null, null, null), 3)).toBe(2);
    expect(suggestedSpot('40t', arrows(0, 1, 2, null, null, null), 4)).toBe(1);
  });

  it('the selected arrow itself does not count as using its spot', () => {
    expect(suggestedSpot('40t', arrows(0, 1, null), 1)).toBe(1);
  });

  it('a single face has no spot to suggest', () => {
    expect(suggestedSpot('40s', arrows(null, null, null), 0)).toBeNull();
    expect(suggestedSpot('122', arrows(null, null, null), 0)).toBeNull();
  });
});

describe('nextArrow', () => {
  it('selects the next empty slot after the current one', () => {
    let s = L.enterScore(start(), 9); // arrow 1 scored and selected
    s = L.nextArrow(s);
    expect(s.cursor).toBe(1);
    expect(s.pinned).toBe(false);
  });

  it('wraps round to an earlier empty slot', () => {
    // arrows 2 and 3 scored, arrow 3 selected
    const s = L.enterScore(L.selectArrow(L.enterScore(L.selectArrow(start(), 1), 9), 2), 8);
    expect(s.cursor).toBe(2);
    expect(L.nextArrow(s).cursor).toBe(0);
  });

  it('a full end stays as it is', () => {
    const s = L.enterScore(L.enterScore(L.enterScore(start(), 9), 8), 7);
    expect(L.nextArrow(s)).toBe(s);
  });
});

describe('primaryAction – the bottom bar button follows the selected arrow', () => {
  const graded = (s) => L.gradeArrow(L.gradeArrow(s, 'm', 1), 's', 2);

  it('an empty slot: Place arrow n, disabled', () => {
    expect(L.primaryAction(start())).toEqual({ action: 'place', slot: 1, end: 1, enabled: false });
  });

  it('a scored slot without both grades: Grade M and S, disabled while grades are asked for', () => {
    const s = L.enterScore(start(), 9);
    expect(L.primaryAction(s)).toEqual({ action: 'grade', slot: 1, end: 1, enabled: false });
    expect(L.primaryAction(L.gradeArrow(s, 'm', 2))).toMatchObject({ action: 'grade', enabled: false });
  });

  it('grades not asked for: a scored slot goes straight to Next arrow', () => {
    const s = L.enterScore(start(), 9);
    expect(L.primaryAction(s, { askGrades: false })).toEqual({ action: 'next', slot: 1, end: 1, enabled: true });
  });

  it('a scored and graded slot with empty ones left: Next arrow', () => {
    // grading the last arrow does not move on, so the selection stays on it
    let s = L.enterScore(L.enterScore(start(), 9), 8);
    s = L.selectArrow(s, 0);
    s = { ...s, pinned: false };
    s = graded(s);
    // grading moved the selection to arrow 2 (scored, ungraded)
    expect(L.primaryAction(s)).toMatchObject({ action: 'grade', slot: 2 });
    s = graded(s); // → arrow 3, empty
    expect(L.primaryAction(s)).toMatchObject({ action: 'place', slot: 3 });
    expect(L.primaryAction(L.selectArrow(s, 1))).toMatchObject({ action: 'next', slot: 2, enabled: true });
  });

  it('the end is full and the selected arrow graded: Save end n', () => {
    let s = L.enterScore(L.enterScore(L.enterScore(start(), 9), 8), 7);
    s = graded(s);
    expect(L.primaryAction(s)).toEqual({ action: 'save', slot: 3, end: 1, enabled: true });
  });

  it('an earlier end opened for editing: back to the end being shot', () => {
    let s = L.nextEnd(L.enterScore(start(), 9));
    s = L.goToEnd(s, 0);
    expect(L.primaryAction(s)).toMatchObject({ action: 'back', end: 2, enabled: true });
  });
});

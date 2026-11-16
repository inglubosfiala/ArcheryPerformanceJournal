import { describe, it, expect } from 'vitest';
import * as L from '../public/js/app/sessionLogic.js';
import {
  endSum,
  isEndComplete,
  gradeAverages,
  sessionTotal,
  endRows,
  sessionCounts,
  scoringHint,
} from '../public/js/app/endSummary.js';

const a = (v, m = null, s = null) => ({ v, m, s, x: null, y: null });
const end = (arrows, ld = 0, cld = 0) => ({ arrows, ld, cld, note: '' });
const session = (face, arrowsPerEnd = 3) =>
  L.createSession({ date: '2026-11-16', distance: 18, face, arrowsPerEnd, now: new Date('2026-11-16T10:00:00Z') });

describe('endSum and isEndComplete', () => {
  it('sums X as 10 and M / empty slots as 0', () => {
    expect(endSum(end([a('X'), a('M'), a(null)]))).toBe(10);
    expect(endSum(end([a(9), a(8), a(10)]))).toBe(27);
  });
  it('an end is complete when every slot has a score', () => {
    expect(isEndComplete(end([a(9), a('M'), a('X')]))).toBe(true);
    expect(isEndComplete(end([a(9), a(null), a('X')]))).toBe(false);
    expect(isEndComplete(end([]))).toBe(false);
  });
});

describe('gradeAverages', () => {
  it('averages only the arrows that have the grade', () => {
    const g = gradeAverages([a(9, 1, 2), a(8, 3, null), a(null, null, 4)]);
    expect(g.m).toBe(2);
    expect(g.s).toBe(3);
  });
  it('null when no arrow has the grade', () => {
    expect(gradeAverages([a(9), a(null)])).toEqual({ m: null, s: null });
  });
});

describe('endRows and sessionTotal', () => {
  const s = {
    ...session('40t'),
    ends: [end([a(10, 1, 2), a(9, 1, 1), a(9, 2, 2)], 1, 1), end([a('X', 1, 1), a(10, 1, 2), a(8, 3, 3)])],
    current: end([a(9, 2, null), a(null), a(null)], 2, 0),
  };

  it('one row per end in the order shot, with the running Σ', () => {
    const rows = endRows(s);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.sum)).toEqual([28, 28, 9]);
    expect(rows.map((r) => r.run)).toEqual([28, 56, 65]);
  });
  it('marks the end being shot and carries let-downs and grade averages', () => {
    const [first, , cur] = endRows(s);
    expect(first.isCurrent).toBe(false);
    expect(first.ld).toBe(1);
    expect(first.avgM).toBeCloseTo(4 / 3);
    expect(cur.isCurrent).toBe(true);
    expect(cur.index).toBe(2);
    expect(cur.avgS).toBeNull();
  });
  it('the total counts every end, the one being shot included', () => {
    expect(sessionTotal(s)).toBe(65);
  });
});

describe('sessionCounts', () => {
  it('counts ends with arrows, scored arrows and the total', () => {
    const s = { ...session('122'), ends: [end([a(9), a(8), a(7)])], current: end([a(10), a(null), a(null)]) };
    expect(sessionCounts(s)).toEqual({ ends: 2, arrows: 4, total: 34 });
  });
  it('an empty end being shot is not counted', () => {
    const s = { ...session('122'), ends: [end([a(9), a(8), a(7)])] };
    expect(sessionCounts(s)).toEqual({ ends: 1, arrows: 3, total: 24 });
  });
});

describe('scoringHint', () => {
  it('nothing entered yet: tap a spot (sheet) or the face (single face)', () => {
    expect(scoringHint(session('40t'))).toBe('Tap a spot or a score');
    expect(scoringHint(session('122'))).toBe('Tap the face or a score');
  });
  it('a scored arrow without both grades: grade it', () => {
    let s = L.enterScore(session('40t'), 9);
    expect(scoringHint(s)).toBe('Grade arrow 1');
    s = L.gradeArrow(s, 'm', 1);
    expect(scoringHint(s)).toBe('Grade arrow 1');
  });
  it('graded: the next spot on a sheet, the next arrow on a single face', () => {
    let s = L.enterScore(session('40t'), 9, 0.1, 0.1, 0);
    s = L.gradeArrow(L.gradeArrow(s, 'm', 1), 's', 2);
    expect(scoringHint(s)).toBe('Next: spot 2');
    let t = L.enterScore(session('122'), 9);
    t = L.gradeArrow(L.gradeArrow(t, 'm', 1), 's', 2);
    expect(scoringHint(t)).toBe('Next: arrow 2');
  });
  it('every slot scored and the selected one graded: end complete', () => {
    let s = session('122');
    for (const v of [9, 9, 9]) s = L.enterScore(s, v);
    s = L.gradeArrow(L.gradeArrow(s, 'm', 1), 's', 1);
    expect(scoringHint(s)).toBe('End complete');
  });
  it('follows the shown end when an earlier end is open', () => {
    let s = session('122');
    s = L.nextEnd(L.enterScore(s, 9));
    s = L.goToEnd(s, 0); // opens with its first empty slot selected
    expect(scoringHint(s)).toBe('Next: arrow 2');
    expect(scoringHint(L.selectArrow(s, 0))).toBe('Grade arrow 1');
  });
});

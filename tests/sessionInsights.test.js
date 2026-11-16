import { describe, it, expect } from 'vitest';
import {
  scoreCounts,
  averageDelta,
  gradeDistribution,
  gradeInsight,
  groupArrows,
  filterArrows,
  groupCentre,
  centreDirection,
  centreReading,
  GROUP_FILTERS,
} from '../public/js/app/sessionInsights.js';

const a = (v, m = null, s = null, x = null, y = null) => ({ v, m, s, x, y });
const end = (...arrows) => ({ arrows, ld: 0, cld: 0, note: '' });
const session = (id, date, ends, extra = {}) => ({ id, date, time: '18:00', type: 'training', status: 'finished', distance: 18, face: '40t', ends, ...extra });

describe('score counts', () => {
  it('counts X, 10 (without X), 9 and 8 or less (misses included); empty slots are skipped', () => {
    const ends = [end(a('X'), a(10), a(9)), end(a(8), a('M'), a(null)), end(a(6), a('X'), a(10))];
    expect(scoreCounts(ends)).toEqual({ x: 2, ten: 2, nine: 1, low: 3 });
  });
});

describe('average delta', () => {
  const at = (id, date, v, extra) => session(id, date, [end(a(v), a(v), a(v))], extra);

  it('compares the per-arrow average with earlier sessions at the same distance and face', () => {
    const earlier = [at('a', '2026-11-01', 8), at('b', '2026-11-02', 9), at('c', '2026-11-03', 10)];
    const now = at('n', '2026-11-10', 10);
    const d = averageDelta(now, [now, ...earlier]);
    expect(d.sessions).toBe(3);
    expect(d.delta).toBeCloseTo(1);
    expect(d.average).toBeCloseTo(9);
  });

  it('pools the arrows of the earlier sessions (a long session weighs more)', () => {
    const long = session('l', '2026-11-01', [end(a(10), a(10), a(10)), end(a(10), a(10), a(10))]);
    const earlier = [long, at('b', '2026-11-02', 7), at('c', '2026-11-03', 7)];
    const now = at('n', '2026-11-10', 9);
    expect(averageDelta(now, earlier).average).toBeCloseTo((60 + 21 + 21) / 12);
  });

  it('is null with fewer than 3 earlier sessions', () => {
    const now = at('n', '2026-11-10', 9);
    expect(averageDelta(now, [at('a', '2026-11-01', 8), at('b', '2026-11-02', 9)])).toBeNull();
  });

  it('leaves out later sessions, other distances or faces, form sessions and sessions without arrows', () => {
    const now = at('n', '2026-11-10', 9);
    const others = [
      at('later', '2026-11-12', 1),
      at('far', '2026-11-01', 1, { distance: 25 }),
      at('face', '2026-11-01', 1, { face: '40v' }),
      { id: 'blank', date: '2026-11-01', type: 'blank', status: 'finished', arrows: 60 },
      session('empty', '2026-11-01', []),
      at('a', '2026-11-01', 8),
      at('b', '2026-11-02', 8),
    ];
    expect(averageDelta(now, others)).toBeNull();
    expect(averageDelta(now, [...others, at('c', '2026-11-03', 8)]).average).toBeCloseTo(8);
  });

  it('orders by date and start time: a session earlier the same day counts', () => {
    const now = at('n', '2026-11-10', 9);
    const same = (id, time) => at(id, '2026-11-10', 8, { time });
    expect(averageDelta(now, [same('a', '09:00'), same('b', '10:00'), same('c', '11:00')])?.sessions).toBe(3);
    expect(averageDelta(now, [same('a', '09:00'), same('b', '10:00'), same('c', '19:00')])).toBeNull();
  });
});

describe('grade distribution', () => {
  it('counts each grade 1–5 and averages the graded arrows', () => {
    const ends = [end(a(10, 1, 2), a(9, 1, null), a(8, 3, 2)), end(a(null, 5, 5))];
    expect(gradeDistribution(ends, 'm')).toEqual({ counts: [2, 0, 1, 0, 1], n: 4, avg: 2.5 });
    expect(gradeDistribution(ends, 's')).toEqual({ counts: [0, 2, 0, 0, 1], n: 3, avg: 3 });
  });

  it('has no average without grades', () => {
    expect(gradeDistribution([end(a(10), a(9))], 'm')).toEqual({ counts: [0, 0, 0, 0, 0], n: 0, avg: null });
  });
});

describe('grade insight', () => {
  it('compares the score of M1 arrows with M3-or-worse arrows', () => {
    const ends = [end(a('X', 1), a(10, 1), a(9, 1)), end(a(8, 3), a(7, 4), a(9, 5)), end(a(10, 2), a(null, 1), a(10, 1))];
    expect(gradeInsight(ends)).toEqual({ m1: { avg: 9.75, n: 4 }, m3: { avg: 8, n: 3 } });
  });

  it('is null while either group has fewer than 3 scored arrows', () => {
    expect(gradeInsight([end(a(10, 1), a(10, 1), a(10, 1)), end(a(8, 3), a(8, 3), a(8, 2))])).toBeNull();
    expect(gradeInsight([end(a(10, 1), a(10, 1), a(8, 3)), end(a(8, 3), a(8, 3), a(8, 4))])).toBeNull();
  });
});

describe('group: arrows and filters', () => {
  const ends = [
    end(a(10, 1, 1, 0.1, 0.1), a(9, 2, 1, 0.2, 0), a(8, 3, 2, 0.4, 0.4)),
    end(a(10, 1, 1, -0.1, 0), a('M', 4, 4), a(null)),
  ];

  it('takes the placed arrows (merged on one spot), each marked M grade and last of its end', () => {
    const g = groupArrows(ends);
    expect(g.total).toBe(5);
    expect(g.arrows.map((p) => [p.x, p.y, p.m, p.last])).toEqual([
      [0.1, 0.1, 1, false],
      [0.2, 0, 2, false],
      [0.4, 0.4, 3, true],
      [-0.1, 0, 1, false],
    ]);
  });

  it('the last of an end is its last scored slot, placed or not', () => {
    // end 2: the last scored arrow (the miss) has no position, so no placed arrow of end 2 is "last"
    expect(groupArrows(ends).arrows.filter((p) => p.last)).toHaveLength(1);
  });

  it('filters: all, M1 only, M3 and worse, last of end', () => {
    const { arrows } = groupArrows(ends);
    expect(GROUP_FILTERS).toEqual(['all', 'm1', 'm3', 'last']);
    expect(filterArrows(arrows, 'all')).toHaveLength(4);
    expect(filterArrows(arrows, 'm1').map((p) => p.x)).toEqual([0.1, -0.1]);
    expect(filterArrows(arrows, 'm3').map((p) => p.x)).toEqual([0.4]);
    expect(filterArrows(arrows, 'last').map((p) => p.x)).toEqual([0.4]);
  });
});

describe('group centre and its reading', () => {
  it('is the mean point of impact, null without arrows', () => {
    expect(groupCentre([{ x: 0, y: 0 }, { x: 0.2, y: -0.4 }])).toEqual({ x: 0.1, y: -0.2 });
    expect(groupCentre([])).toBeNull();
  });

  it('names the direction past a small threshold (y grows downwards)', () => {
    expect(centreDirection({ x: 0.01, y: -0.02 })).toBe('centred');
    expect(centreDirection({ x: 0.2, y: 0.3 })).toBe('low right');
    expect(centreDirection({ x: -0.2, y: 0 })).toBe('left');
    expect(centreDirection({ x: 0, y: -0.1 })).toBe('high');
  });

  it('reads All as the centre direction', () => {
    expect(centreReading({ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }, 'all', 30)).toBe('All 30 arrows: centre low right.');
    expect(centreReading({ x: 0, y: 0 }, { x: 0, y: 0 }, 'all', 1)).toBe('All 1 arrow: centre on the middle.');
  });

  it('reads a filter against All', () => {
    expect(centreReading({ x: 0.3, y: 0.3 }, { x: 0.1, y: 0.05 }, 'm3', 4)).toBe('M3 or worse (4): centre low right — lower and further right than all arrows.');
    expect(centreReading({ x: 0.1, y: 0.06 }, { x: 0.1, y: 0.05 }, 'm1', 9)).toBe('M1 only (9): centre low right — about where all arrows are.');
    expect(centreReading({ x: -0.2, y: -0.2 }, { x: 0, y: 0 }, 'last', 3)).toBe('Last of end (3): centre high left — higher and further left than all arrows.');
  });

  it('says so when no arrow matches the filter', () => {
    expect(centreReading(null, { x: 0, y: 0 }, 'm3', 0)).toBe('No arrows graded M3 or worse in this session.');
    expect(centreReading(null, null, 'all', 0)).toBe('No arrows placed on the face.');
  });
});

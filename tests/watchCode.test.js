import { describe, it, expect } from 'vitest';
import { parseWatchCode } from '../public/js/app/watchCode.js';
import { hrChart, endTimeline, mmss } from '../public/js/app/hrTrace.js';
import * as L from '../public/js/app/sessionLogic.js';
import { collections } from '../public/js/app/collections.js';

// The code the watch app showed for end 1 in the simulator (no heart-rate sensor there: 000)
const SIM = 'APJ1.E1.0134000.0245000.0354000.0433000.0544000.0623000';

describe('parseWatchCode', () => {
  it('reads the end number and each arrow: number, M, S, heart rate', () => {
    const r = parseWatchCode('APJ1.E3.0143092.0254088');
    expect(r).toEqual({
      ok: true,
      end: 3,
      arrows: [
        { no: 1, m: 4, s: 3, hr: 92 },
        { no: 2, m: 5, s: 4, hr: 88 },
      ],
    });
  });

  it('reads the simulator code; heart rate 000 is none', () => {
    const r = parseWatchCode(SIM);
    expect(r.ok).toBe(true);
    expect(r.arrows.map((a) => [a.no, a.m, a.s, a.hr])).toEqual([
      [1, 3, 4, null],
      [2, 4, 5, null],
      [3, 5, 4, null],
      [4, 3, 3, null],
      [5, 4, 4, null],
      [6, 2, 3, null],
    ]);
  });

  it('a 0 grade is a grade not given', () => {
    expect(parseWatchCode('APJ1.E1.0700101').arrows[0]).toEqual({ no: 7, m: null, s: null, hr: 101 });
  });

  it('sorts the arrows by number and accepts lower case and spaces around', () => {
    const r = parseWatchCode('  apj1.e2.1234080.0355090 ');
    expect(r.ok).toBe(true);
    expect(r.arrows.map((a) => a.no)).toEqual([3, 12]);
  });

  it('an end with no arrows yet is valid and empty', () => {
    expect(parseWatchCode('APJ1.E4')).toEqual({ ok: true, end: 4, arrows: [] });
  });

  it('heart rate outside 30-250 is dropped, the grades kept', () => {
    expect(parseWatchCode('APJ1.E1.0145999').arrows[0]).toEqual({ no: 1, m: 4, s: 5, hr: null });
  });

  it('refuses codes that are not from the watch app', () => {
    expect(parseWatchCode('https://example.com')).toEqual({ ok: false, error: 'not-watch' });
    expect(parseWatchCode('')).toEqual({ ok: false, error: 'not-watch' });
    expect(parseWatchCode(null)).toEqual({ ok: false, error: 'not-watch' });
  });

  it('refuses a newer format version', () => {
    expect(parseWatchCode('APJ3.E1.0143092')).toEqual({ ok: false, error: 'version' });
  });

  it('refuses damaged codes: wrong length, grade over 5, arrow 0, repeated arrow', () => {
    for (const bad of ['APJ1.E1.014309', 'APJ1.E1.0163092', 'APJ1.E1.0043092', 'APJ1.E1.0143092.0154090', 'APJ1.1.0143092', 'APJ1.E1.01A3092']) {
      expect(parseWatchCode(bad)).toEqual({ ok: false, error: 'bad' });
    }
  });
});

describe('parseWatchCode, format 2 (heart-rate trace)', () => {
  // trace: bins of 2 s, first 80, then changes 0, +1, +2 ('L' = 0, 'M' = +1, 'N' = +2)
  const CODE = 'APJ2.E2.0143004.0254006.H2080LMN';

  it('reads the arrows with their shot time and the trace', () => {
    expect(parseWatchCode(CODE)).toEqual({
      ok: true,
      end: 2,
      arrows: [
        { no: 1, m: 4, s: 3, t: 4, hr: 81 },
        { no: 2, m: 5, s: 4, t: 6, hr: 83 },
      ],
      trace: { step: 2, hr: [80, 80, 81, 83] },
    });
  });

  it('a shot after the end of the trace takes its last value', () => {
    expect(parseWatchCode('APJ2.E1.0143099.H1100LK').arrows[0].hr).toBe(99);
  });

  it('decodes falling changes and the largest steps', () => {
    // '0' = -21, ':' = +21
    expect(parseWatchCode('APJ2.E1.0143000.H1120:0').trace.hr).toEqual([120, 141, 120]);
  });

  it('without a trace the arrows have no heart rate', () => {
    expect(parseWatchCode('APJ2.E1.0143004')).toEqual({ ok: true, end: 1, arrows: [{ no: 1, m: 4, s: 3, t: 4, hr: null }], trace: null });
  });

  it('refuses a damaged trace', () => {
    for (const bad of ['APJ2.E1.0143004.H0080L', 'APJ2.E1.0143004.H2020L', 'APJ2.E1.0143004.H2080 L', 'APJ2.E1.0143004.H2240:::', 'APJ2.E1.0143004.H2080L.0254006']) {
      expect(parseWatchCode(bad)).toEqual({ ok: false, error: 'bad' });
    }
  });

  it('fills the end: shot times, heart rates and the trace on the end', () => {
    const s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    expect(s.current.arrows.map((a) => [a.no, a.t, a.hr])).toEqual([
      [1, 4, 81],
      [2, 6, 83],
    ]);
    expect(s.current.hrTrace).toEqual({ step: 2, hr: [80, 80, 81, 83] });
    const v = collections.sessions.validate({ ...L.nextEnd(L.enterScore(L.enterScore(s, 9), 8)), id: 'x', status: 'finished' });
    expect(v.filter((e) => /trace|shot time/.test(e))).toEqual([]);
  });

  it('a code without a trace removes an older trace from the end', () => {
    let s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    s = L.applyWatchGrades(s, parseWatchCode('APJ2.E2.0143004'));
    expect(s.current.hrTrace).toBeUndefined();
  });

  it('the validator refuses a broken trace', () => {
    let s = L.applyWatchGrades(start(1), parseWatchCode('APJ2.E1.0143004.H2080LMN'));
    s = L.nextEnd(L.enterScore(s, 10));
    s.ends[0].hrTrace = { step: 0, hr: [80, 20] };
    s.ends[0].arrows[0].t = -1;
    const v = collections.sessions.validate({ ...s, id: 'x', status: 'finished' });
    expect(v.filter((e) => /trace|shot time/.test(e))).toEqual(['end 1 arrow 1: invalid shot time', 'end 1: invalid heart-rate trace']);
  });
});

const start = (n = 6) => L.createSession({ date: '2026-11-18', distance: 18, face: '40s', arrowsPerEnd: n });

describe('applyWatchGrades', () => {
  it('fills the shown end in arrow-number order with M, S, heart rate and arrow number', () => {
    const code = parseWatchCode('APJ1.E1.0543092.0254088.0333000');
    const s = L.applyWatchGrades(start(4), code);
    expect(s.current.arrows).toEqual([
      { v: null, m: 5, s: 4, x: null, y: null, no: 2, hr: 88 },
      { v: null, m: 3, s: 3, x: null, y: null, no: 3 },
      { v: null, m: 4, s: 3, x: null, y: null, no: 5, hr: 92 },
      { v: null, m: null, s: null, x: null, y: null },
    ]);
    expect(s.cursor).toBe(0);
    expect(s.pinned).toBe(false);
  });

  it('then the scores go into the slots one after another, keeping the grades', () => {
    let s = L.applyWatchGrades(start(3), parseWatchCode('APJ1.E1.0143092.0254088.0333090'));
    s = L.enterScore(s, 10);
    s = L.enterScore(s, 9);
    s = L.enterScore(s, 8);
    expect(s.current.arrows.map((a) => [a.no, a.v, a.m, a.s])).toEqual([
      [1, 10, 4, 3],
      [2, 9, 5, 4],
      [3, 8, 3, 3],
    ]);
  });

  it('keeps scores already entered and replaces their grades', () => {
    let s = L.enterScore(start(2), 10, 0.1, 0.1);
    s = L.gradeArrow(s, 'm', 1);
    s = L.applyWatchGrades(s, parseWatchCode('APJ1.E1.0145080'));
    expect(s.current.arrows[0]).toEqual({ v: 10, m: 4, s: 5, x: 0.1, y: 0.1, no: 1, hr: 80 });
  });

  it('applies to a saved end when one is shown', () => {
    let s = L.enterScore(start(1), 9);
    s = L.nextEnd(s);
    s = L.prevEnd(s);
    s = L.applyWatchGrades(s, parseWatchCode('APJ1.E1.0322070'));
    expect(s.ends[0].arrows[0]).toMatchObject({ v: 9, m: 2, s: 2, no: 3, hr: 70 });
  });

  it('more arrows than slots changes nothing', () => {
    const s = start(2);
    expect(L.applyWatchGrades(s, parseWatchCode('APJ1.E1.0143092.0254088.0333090'))).toBe(s);
  });

  it('arrow number and heart rate pass the session validator', () => {
    let s = L.applyWatchGrades(start(2), parseWatchCode('APJ1.E1.0143092.0254088'));
    s = L.enterScore(s, 10);
    s = L.enterScore(s, 9);
    s = L.nextEnd(s);
    const v = collections.sessions.validate({ ...s, id: 'x', status: 'finished', ends: s.ends });
    expect(v.filter((e) => /arrow number|heart rate/.test(e))).toEqual([]);
    s.ends[0].arrows[0].no = 0;
    s.ends[0].arrows[1].hr = 20;
    const bad = collections.sessions.validate({ ...s, id: 'x', status: 'finished', ends: s.ends });
    expect(bad.filter((e) => /arrow number|heart rate/.test(e))).toEqual(['end 1 arrow 1: invalid arrow number', 'end 1 arrow 2: invalid heart rate']);
  });
});

describe('hrChart', () => {
  it('draws the trace across the box and puts each shot on the line', () => {
    const c = hrChart({ step: 2, hr: [80, 90, 100] }, [{ t: 2, m: 4 }, { t: 9, m: 2 }, { v: 9 }], { w: 100, h: 20, pad: 0 });
    expect(c.points).toBe('0,20 50,10 100,0');
    expect(c.shots).toEqual([
      { x: 50, y: 10, hr: 90, m: 4 },
      { x: 100, y: 0, hr: 100, m: 2 },
    ]);
    expect([c.min, c.max, c.seconds]).toEqual([80, 100, 4]);
  });

  it('a flat curve stays in the middle; no trace, no chart', () => {
    expect(hrChart({ step: 1, hr: [70, 70] }, [], { w: 10, h: 20, pad: 0 }).points).toBe('0,10 10,10');
    expect(hrChart(null)).toBeNull();
    expect(hrChart({ step: 1, hr: [] })).toBeNull();
  });
});

describe('an end closed on the watch without grades', () => {
  it('brings only its heart-rate trace; the slots stay as they are', () => {
    const code = parseWatchCode('APJ2.E4.H3090LM');
    expect(code).toEqual({ ok: true, end: 4, arrows: [], trace: { step: 3, hr: [90, 90, 91] } });
    const before = L.enterScore(start(3), 9);
    const s = L.applyWatchGrades(before, code);
    expect(s.current.arrows).toEqual(before.current.arrows);
    expect(s.current.hrTrace).toEqual({ step: 3, hr: [90, 90, 91] });
  });
});

describe('endTimeline', () => {
  it('the shots in the order shot, with the gap since the one before and the end length', () => {
    const end = {
      hrTrace: { step: 2, hr: [80, 90, 100, 110, 100, 90] },
      arrows: [
        { v: 10, m: 4, s: 5, no: 3, t: 9, hr: 100 },
        { v: 9, m: 2, s: 3, no: 1, t: 2 },
        { v: null, m: null, s: null },
      ],
    };
    expect(endTimeline(end)).toEqual({
      seconds: 12,
      shots: [
        { no: 1, t: 2, gap: null, m: 2, s: 3, hr: 90, v: 9 },
        { no: 3, t: 9, gap: 7, m: 4, s: 5, hr: 100, v: 10 },
      ],
      avgGap: 7,
      firstShot: 2,
      lastShot: 9,
      hr: { min: 80, avg: 95, max: 110 },
    });
  });

  it('an end closed without grades: only the heart rate; no watch data at all: null', () => {
    expect(endTimeline({ hrTrace: { step: 1, hr: [70, 72] }, arrows: [{ v: 9 }] })).toMatchObject({ seconds: 2, shots: [], avgGap: null, hr: { min: 70, avg: 71, max: 72 } });
    expect(endTimeline({ arrows: [{ v: 9, m: 3, s: 3 }] })).toBeNull();
  });

  it('shot times without a heart rate still give the timing', () => {
    expect(endTimeline({ arrows: [{ no: 1, t: 5 }, { no: 2, t: 50 }] })).toMatchObject({ seconds: 50, avgGap: 45, hr: null });
  });

  it('formats seconds as m:ss', () => {
    expect([mmss(0), mmss(42), mmss(725.4)]).toEqual(['0:00', '0:42', '12:05']);
  });
});

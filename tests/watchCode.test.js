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
    expect(parseWatchCode('APJ9.E1.0143092')).toEqual({ ok: false, error: 'version' });
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
      detected: [],
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
    expect(parseWatchCode('APJ2.E1.0143004')).toEqual({ ok: true, end: 1, arrows: [{ no: 1, m: 4, s: 3, t: 4, hr: null }], trace: null, detected: [] });
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
    expect(code).toEqual({ ok: true, end: 4, arrows: [], trace: { step: 3, hr: [90, 90, 91] }, detected: [] });
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
    expect(endTimeline(end)).toMatchObject({
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

describe('format 3: shots the watch detected (set-up, draw, hold)', () => {
  // two releases at 12 s and 41 s; arrow #2 tapped at 15 s, #1 at 44 s; trace of 2 s bins
  const CODE = 'APJ3.E2.0143044.0254015.D01220140431.D04124140662.H2080LMNLKJ';

  it('reads the detected shots: release second, set-up, draw and hold in seconds, steadiness', () => {
    const r = parseWatchCode(CODE);
    expect(r.ok).toBe(true);
    expect(r.detected).toEqual([
      { t: 12, setup: 2, draw: 1.4, hold: 4.3, steady: 1 },
      { t: 41, setup: 2.4, draw: 1.4, hold: 6.6, steady: 2 },
    ]);
    expect(r.arrows.map((a) => [a.no, a.t])).toEqual([
      [1, 44],
      [2, 15],
    ]);
    expect(r.trace.step).toBe(2);
  });

  it('format 2 codes have no detected shots', () => {
    expect(parseWatchCode('APJ2.E1.0143004').detected).toEqual([]);
  });

  it('refuses a damaged detected shot', () => {
    expect(parseWatchCode('APJ3.E1.0143004.D012201404')).toEqual({ ok: false, error: 'bad' });
  });

  it('the end keeps the detected shots; the timeline puts each graded arrow on the release before its tap', () => {
    const s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    expect(s.current.watchShots).toHaveLength(2);
    const tl = endTimeline({ ...s.current, arrows: s.current.arrows.map((a, i) => ({ ...a, v: [9, 10][i] })) });
    expect(tl.shots.map((x) => [x.t, x.no, x.m, x.setup, x.draw, x.hold, x.v])).toEqual([
      [12, 2, 5, 2, 1.4, 4.3, 10],
      [41, 1, 4, 2.4, 1.4, 6.6, 9],
    ]);
    expect(tl.avg).toEqual({ setup: 2.2, draw: 1.4, hold: 5.4 });
    expect(tl.shots[1].gap).toBe(29);
  });

  it('a release without a graded arrow and an arrow without a release both stay on the timeline', () => {
    const tl = endTimeline({
      watchShots: [{ t: 10, setup: 2, draw: 2, hold: 4, steady: 1 }],
      arrows: [{ no: 3, t: 60, m: 3, s: 3 }],
    });
    expect(tl.shots.map((x) => [x.t, x.no, x.draw ?? null])).toEqual([
      [10, null, 2],
      [60, 3, null],
    ]);
  });

  it('the validator checks the detected shots', () => {
    let s = L.applyWatchGrades(start(1), parseWatchCode('APJ3.E1.0143014.D01220140431'));
    s = L.nextEnd(L.enterScore(s, 10));
    expect(collections.sessions.validate({ ...s, id: 'x', status: 'finished' }).filter((e) => /detected/.test(e))).toEqual([]);
    s.ends[0].watchShots[0].hold = -1;
    expect(collections.sessions.validate({ ...s, id: 'x', status: 'finished' }).filter((e) => /detected/.test(e))).toEqual(['end 1: invalid detected shots']);
  });
});

describe('format 4: the watch names the arrow of each release', () => {
  // picked arrow #2 at 3 s, released at 12 s, graded; picked #1 at 20 s, released at 31 s
  const CODE = 'APJ4.E1.0143020.0254003.D0120220140431.D0310124140662';

  it('reads the arrow of each release', () => {
    const r = parseWatchCode(CODE);
    expect(r.detected).toEqual([
      { t: 12, no: 2, setup: 2, draw: 1.4, hold: 4.3, steady: 1 },
      { t: 31, no: 1, setup: 2.4, draw: 1.4, hold: 6.6, steady: 2 },
    ]);
  });

  it('a release before any arrow was picked has no arrow (00)', () => {
    expect(parseWatchCode('APJ4.E1.D0120020140431').detected[0]).toEqual({ t: 12, setup: 2, draw: 1.4, hold: 4.3, steady: 1 });
  });

  it('the timeline joins each release with the arrow the watch named, even when picked before the shot', () => {
    const s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    const tl = endTimeline(s.current);
    expect(tl.shots.map((x) => [x.t, x.no, x.m, x.hold])).toEqual([
      [12, 2, 5, 4.3],
      [31, 1, 4, 6.6],
    ]);
  });

  it('refuses an arrow number over 24 and validates the named arrow', () => {
    expect(parseWatchCode('APJ4.E1.D0122520140431')).toEqual({ ok: false, error: 'bad' });
    let s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    s = L.nextEnd(L.enterScore(L.enterScore(s, 9), 8));
    expect(collections.sessions.validate({ ...s, id: 'x', status: 'finished' }).filter((e) => /detected/.test(e))).toEqual([]);
    s.ends[0].watchShots[0].no = 0;
    expect(collections.sessions.validate({ ...s, id: 'x', status: 'finished' }).filter((e) => /detected/.test(e))).toEqual(['end 1: invalid detected shots']);
  });
});

describe('format 5: settle, anchor and follow-through of each release', () => {
  // arrow #2 released at 12 s: hold 4.3 s, of which 3.0 s settle (F = 15 x 0.2), tilt change 0.8
  // degrees (8), follow-through x -30 mm (B = 11), y -15 mm (G = 16), z +3 mm (M = 22)
  const CODE = 'APJ5.E1.0143020.0254003.D0120220140431F8BGM.D0310124140662A3CGL';

  it('reads the extra figures of each release', () => {
    expect(parseWatchCode(CODE).detected).toEqual([
      {
        t: 12,
        no: 2,
        setup: 2,
        draw: 1.4,
        hold: 4.3,
        steady: 1,
        settle: 3,
        drift: 0.8,
        fx: -30,
        fy: -15,
        fz: 3,
      },
      {
        t: 31,
        no: 1,
        setup: 2.4,
        draw: 1.4,
        hold: 6.6,
        steady: 2,
        settle: 2,
        drift: 0.3,
        fx: -27,
        fy: -15,
        fz: 0,
      },
    ]);
  });

  it('a release without them (the code got too long) reads as in format 4', () => {
    expect(parseWatchCode('APJ5.E1.D0120220140431').detected[0]).toEqual({
      t: 12,
      no: 2,
      setup: 2,
      draw: 1.4,
      hold: 4.3,
      steady: 1,
    });
  });

  it('refuses a damaged tail', () => {
    expect(parseWatchCode('APJ5.E1.D0120220140431F8B')).toEqual({ ok: false, error: 'bad' });
    expect(parseWatchCode('APJ4.E1.D0120220140431F8BGM')).toEqual({ ok: false, error: 'bad' });
  });

  it('the timeline splits the hold into settle and anchor and measures the follow-through', () => {
    const tl = endTimeline(L.applyWatchGrades(start(2), parseWatchCode(CODE)).current);
    expect(tl.shots.map((x) => [x.no, x.settle, x.anchor, x.drift, x.follow, x.followOff, x.followBack])).toEqual([
      [2, 3, 1.3, 0.8, 34, 2, 30],
      [1, 2, 4.6, 0.3, 31, 2, 27],
    ]);
    expect(tl.avg).toMatchObject({ hold: 5.4, anchor: 2.9, follow: 32 });
  });

  it('a format 4 end has no split', () => {
    const tl = endTimeline(
      L.applyWatchGrades(start(2), parseWatchCode('APJ4.E1.0143020.D0120120140431')).current,
    );
    expect(tl.shots[0].settle).toBeUndefined();
    expect(tl.avg.anchor).toBeUndefined();
  });

  it('the validator checks the extra figures', () => {
    let s = L.applyWatchGrades(start(2), parseWatchCode(CODE));
    s = L.nextEnd(L.enterScore(L.enterScore(s, 9), 8));
    const errors = () =>
      collections.sessions.validate({ ...s, id: 'x', status: 'finished' }).filter((e) => /detected/.test(e));
    expect(errors()).toEqual([]);
    s.ends[0].watchShots[0].fx = 99;
    expect(errors()).toEqual(['end 1: invalid detected shots']);
    s.ends[0].watchShots[0].fx = -30;
    delete s.ends[0].watchShots[0].drift;
    expect(errors()).toEqual(['end 1: invalid detected shots']);
  });
});

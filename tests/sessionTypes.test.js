import { describe, it, expect } from 'vitest';
import { collections } from '../public/js/app/collections.js';
import { migrate, migrations } from '../public/js/storage/migrations.js';
import * as L from '../public/js/app/sessionLogic.js';
import {
  isScored,
  isGraded,
  formSummary,
  setupSummary,
  emptyDrill,
  newestFirst,
  ROUNDS,
  WA_ROUNDS,
  roundByName,
  roundTotals,
  roundSetup,
} from '../public/js/app/sessionTypes.js';
import { faceLabel, FACE_IDS, DISTANCES } from '../public/js/app/scoring.js';

const validate = (r) => collections.sessions.validate({ id: 'a', ...r });
const strength = (extra = {}) => ({
  type: 'strength',
  date: '2026-11-11',
  status: 'finished',
  minutes: 30,
  effort: 7,
  drills: [emptyDrill('spt'), emptyDrill('draw')],
  note: '',
  ...extra,
});
const mental = (extra = {}) => ({
  type: 'mental',
  date: '2026-11-11',
  status: 'finished',
  minutes: 20,
  focus: 2,
  techniques: ['Visualisation'],
  ...extra,
});

describe('session types', () => {
  it('training and competition are scored, strength and mental are forms', () => {
    expect(['training', 'competition'].map(isScored)).toEqual([true, true]);
    expect(['strength', 'mental'].map(isScored)).toEqual([false, false]);
  });

  it('a competition session keeps its event details', () => {
    const s = L.createSession({
      type: 'competition',
      date: '2026-11-11',
      distance: 18,
      face: '40t',
      arrowsPerEnd: 3,
      competition: { event: 'Indoor Cup', round: 'WA 18', conditions: '', placement: '' },
    });
    expect(s.competition.event).toBe('Indoor Cup');
    expect(validate(s)).toEqual([]);
  });

  it('accepts valid strength and mental sessions', () => {
    expect(validate(strength())).toEqual([]);
    expect(validate(mental())).toEqual([]);
    expect(validate(strength({ minutes: null, effort: null, drills: [] }))).toEqual([]);
  });

  it('rejects bad strength and mental fields', () => {
    expect(validate(strength({ effort: 11 })).join()).toMatch(/effort/);
    expect(validate(strength({ drills: [{ kind: 'pushups', sets: 1, reps: 1 }] })).join()).toMatch(
      /unknown drill/,
    );
    expect(validate(strength({ status: 'active' })).join()).toMatch(/finished/);
    // a drill run to its end on the timer is marked done (optional, a boolean)
    expect(validate(strength({ drills: [{ kind: 'spt', sets: 1, reps: 10, holdSec: 10, restSec: 10, done: true }] }))).toEqual([]);
    expect(validate(strength({ drills: [{ kind: 'draw', sets: 1, reps: 10, done: 'yes' }] })).join()).toMatch(/done/);
    expect(validate(mental({ focus: 0 })).join()).toMatch(/focus/);
    expect(validate(mental({ techniques: ['Juggling'] })).join()).toMatch(/techniques/);
    expect(validate({ ...mental(), type: 'yoga' }).join()).toMatch(/session type/);
  });

  it('summarises a form session in one line', () => {
    expect(formSummary(strength())).toBe('30 min · effort 7/10 · 2 drills');
    expect(formSummary(mental())).toBe('20 min · focus 2/5 · Visualisation');
  });
});

describe('blank bale', () => {
  const blank = (extra = {}) => ({ type: 'blank', date: '2026-11-11', status: 'finished', arrows: 60, minutes: 40, note: '', ...extra });
  it('is a form session that counts arrows without a score', () => {
    expect(isScored('blank')).toBe(false);
    expect(validate(blank())).toEqual([]);
    expect(validate(blank({ arrows: null }))).toEqual([]);
    expect(validate(blank({ arrows: -3 })).join()).toMatch(/arrow count/);
    expect(formSummary(blank())).toBe('60 arrows · 40 min');
    expect(formSummary({ ...blank(), goal: 90 })).toBe('60 arrows · goal 90 · 40 min');
  });
});

describe('manual session', () => {
  const manual = (extra = {}) => ({ type: 'manual', date: '2026-11-08', status: 'finished', arrows: 90, minutes: null, note: '', ...extra });
  it('needs the arrows or the duration', () => {
    expect(isScored('manual')).toBe(false);
    expect(validate(manual())).toEqual([]);
    expect(validate(manual({ arrows: null, minutes: 45 }))).toEqual([]);
    expect(validate(manual({ arrows: null })).join()).toMatch(/arrows or the duration/);
    expect(validate(manual({ arrows: -1 })).join()).toMatch(/arrow count/);
    expect(formSummary(manual({ minutes: 45 }))).toBe('90 arrows · 45 min');
  });
  it('is refused by apps that only know schema 4', () => {
    expect(migrate({ schemaVersion: 4 }, 5, migrations).schemaVersion).toBe(5);
    expect(() => migrate({ schemaVersion: 5 }, 4, migrations)).toThrow(/newer/);
  });
});

describe('schema v3 migration', () => {
  it('marks existing sessions as training and leaves deletion markers alone', () => {
    const v2 = {
      schemaVersion: 2,
      collections: {
        sessions: [
          { id: 'a', date: '2026-11-09' },
          { id: 'b', deleted: true },
        ],
        competitions: [],
      },
    };
    const v3 = migrate(v2, 3, migrations);
    expect(v3.schemaVersion).toBe(3);
    expect(v3.collections.sessions[0].type).toBe('training');
    expect(v3.collections.sessions[1].type).toBeUndefined();
  });
});

describe('session order', () => {
  it('sorts newest first by date and start time, older sessions by when they were created', () => {
    const a = { id: 'a', date: '2026-11-10', time: '18:00', createdAt: '2026-11-12T09:00:00Z' };
    const b = { id: 'b', date: '2026-11-10', time: '07:30', createdAt: '2026-11-12T10:00:00Z' };
    const c = { id: 'c', date: '2026-11-11', createdAt: '2026-11-11T08:00:00Z' };
    expect([b, a, c].sort(newestFirst).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('setup line of a scored session', () => {
  const ss = { type: 'training', distance: 18, face: '40t', ends: [] };
  it('gives the distance and the face, then the parts asked for', () => {
    expect(setupSummary(ss)).toBe(`18 m · ${faceLabel('40t')}`);
    expect(setupSummary(ss, '4 ends', '', null, '60 min')).toBe(`18 m · ${faceLabel('40t')} · 4 ends · 60 min`);
  });
});

describe('competition conditions as chips', () => {
  it('reads known conditions as chips, in the chip order, and keeps the rest as text', async () => {
    const { parseConditions } = await import('../public/js/app/sessionTypes.js');
    expect(parseConditions('wind; HALL, light, dusty')).toEqual({ chips: ['Hall', 'Wind'], rest: 'light, dusty' });
    expect(parseConditions('Low light')).toEqual({ chips: ['Low light'], rest: '' });
    expect(parseConditions('')).toEqual({ chips: [], rest: '' });
    expect(parseConditions(undefined)).toEqual({ chips: [], rest: '' });
  });

  it('joins chips and the rest into one comma-separated text', async () => {
    const { joinConditions, parseConditions } = await import('../public/js/app/sessionTypes.js');
    expect(joinConditions(['Wind', 'Hall'], ' dusty ')).toBe('Hall, Wind, dusty');
    expect(joinConditions([], '')).toBe('');
    const text = 'Hall, Rain, dusty';
    const { chips, rest } = parseConditions(text);
    expect(joinConditions(chips, rest)).toBe(text);
  });
});

describe('toggling one condition chip', () => {
  it('turns a condition on or off and keeps the typed rest', async () => {
    const { toggleCondition } = await import('../public/js/app/sessionTypes.js');
    expect(toggleCondition('Hall, dusty', 'Wind')).toBe('Hall, Wind, dusty');
    expect(toggleCondition('Hall, Wind, dusty', 'Hall')).toBe('Wind, dusty');
    expect(toggleCondition('', 'Low light')).toBe('Low light');
  });
});

describe('M / S grading of a scored session', () => {
  const base = { date: '2026-11-16', distance: 18, face: '40s', arrowsPerEnd: 3 };
  it('is on by default and for sessions stored before the choice existed', () => {
    const s = L.createSession(base);
    expect('grading' in s).toBe(false);
    expect(isGraded(s)).toBe(true);
  });
  it('is stored as grading: false when turned off, and the session stays valid', () => {
    const s = L.createSession({ ...base, grading: false });
    expect(s.grading).toBe(false);
    expect(isGraded(s)).toBe(false);
    expect(validate(s)).toEqual([]);
  });
  it('rejects a grading value that is not a yes / no', () => {
    expect(validate({ ...L.createSession(base), grading: 'off' })).toContain('invalid grading choice');
  });
});

describe('World Archery rounds', () => {
  it('offers every WA round as a chip, keeping the names stored by earlier sessions', () => {
    expect(ROUNDS).toEqual(WA_ROUNDS.map((r) => r.name));
    for (const name of ['WA 18 m', 'WA 25 m', 'WA 70 m']) expect(ROUNDS).toContain(name);
    for (const r of WA_ROUNDS) for (const p of r.passes) {
      expect(FACE_IDS).toContain(p.face);
      expect(DISTANCES).toContain(p.distance);
    }
  });

  it('knows the arrows and the highest score of a round', () => {
    expect(roundTotals(roundByName('WA 70 m'))).toEqual({ arrows: 72, max: 720 });
    expect(roundTotals(roundByName('WA 18 m'))).toEqual({ arrows: 60, max: 600 });
    expect(roundTotals(roundByName('WA 1440'))).toEqual({ arrows: 144, max: 1440 });
    expect(roundTotals(roundByName('WA 900'))).toEqual({ arrows: 90, max: 900 });
    expect(roundByName('Indoor 2 × 30')).toBeNull();
  });

  it('suggests the first pass, keeping compound scoring where the face has it', () => {
    expect(roundSetup(roundByName('WA 18 m'), '40t')).toEqual({ distance: 18, face: '40t', arrowsPerEnd: 3 });
    expect(roundSetup(roundByName('WA 18 m'), '60c')).toEqual({ distance: 18, face: '40tc', arrowsPerEnd: 3 });
    expect(roundSetup(roundByName('WA 50 m compound'), '40tc')).toEqual({ distance: 50, face: '80r', arrowsPerEnd: 6 });
    expect(roundSetup(roundByName('WA 1440'), '122')).toEqual({ distance: 90, face: '122', arrowsPerEnd: 6 });
  });
});

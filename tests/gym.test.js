import { describe, it, expect } from 'vitest';
import {
  prefillExercises,
  prefillSource,
  lastTimeText,
  lastTimeOf,
  setCounts,
  doneSets,
  progressText,
  gymSummary,
  hoursMinutes,
  clampReps,
  clampKg,
  kgText,
  repsStep,
  withAddedSet,
  withoutSet,
  newExercise,
  moved,
  emptyGym,
} from '../public/js/app/gym.js';
import { collections } from '../public/js/app/collections.js';
import { migrate, migrations } from '../public/js/storage/migrations.js';
import { SCHEMA_VERSION } from '../public/js/config.js';
import { formSummary, SESSION_TYPES, TYPE_LABELS } from '../public/js/app/sessionTypes.js';

const set = (reps, kg = 0, done = true) => ({ reps, kg, done });
const gym = (extra = {}) => ({
  type: 'gym',
  status: 'finished',
  date: '2026-11-10',
  minutes: 52,
  focus: ['Upper body'],
  exercises: [],
  note: '',
  ...extra,
});
const validate = (r) => collections.sessions.validate({ id: 'g', ...r });

describe('gym: last time', () => {
  it('reads equal sets as "n × reps · kg"', () => {
    expect(lastTimeText({ unit: 'reps', sets: [set(10, 45), set(10, 45), set(10, 45)] })).toBe('3 × 10 · 45 kg');
  });
  it('leaves body weight out and adds seconds for a timed exercise', () => {
    expect(lastTimeText({ unit: 'reps', sets: [set(8), set(8), set(8)] })).toBe('3 × 8');
    expect(lastTimeText({ unit: 's', sets: [set(60), set(60), set(60)] })).toBe('3 × 60 s');
  });
  it('lists varying reps and shows the heaviest set', () => {
    expect(lastTimeText({ unit: 'reps', sets: [set(10, 45), set(10, 47.5), set(8, 47.5)] })).toBe('10, 10, 8 · 47.5 kg');
  });
  it('counts the done sets, or all of them when none was ticked', () => {
    expect(lastTimeText({ unit: 'reps', sets: [set(10, 45), set(10, 45, false)] })).toBe('1 × 10 · 45 kg');
    expect(lastTimeText({ unit: 'reps', sets: [set(10, 0, false), set(10, 0, false)] })).toBe('2 × 10');
    expect(lastTimeText({ unit: 'reps', sets: [] })).toBe('');
  });
  it('finds the newest session with the exercise, by name in any case', () => {
    const sessions = [
      gym({ exercises: [{ name: 'Squat', unit: 'reps', sets: [set(5, 80)] }] }),
      gym({ exercises: [{ name: 'Seated row', unit: 'reps', sets: [set(10, 45)] }] }),
      gym({ exercises: [{ name: 'Seated row', unit: 'reps', sets: [set(12, 40)] }] }),
    ];
    expect(lastTimeOf('seated row', sessions)).toBe('1 × 10 · 45 kg');
    expect(lastTimeOf('Deadlift', sessions)).toBeNull();
  });
});

describe('gym: pre-fill', () => {
  const upper = gym({ focus: ['Upper body', 'Core'], exercises: [{ name: 'Pull-ups', unit: 'reps', sets: [set(8), set(8), set(7, 0, false)] }] });
  const lower = gym({ focus: ['Lower body'], exercises: [{ name: 'Squat', unit: 'reps', sets: [set(5, 80)] }] });
  const noteOnly = gym({ focus: ['Core'], exercises: [], note: 'circuit' });

  it('takes the newest session sharing a focus, its done sets copied as not done', () => {
    expect(prefillExercises([lower, upper], ['Core'])).toEqual([
      { name: 'Pull-ups', unit: 'reps', sets: [set(8, 0, false), set(8, 0, false)] },
    ]);
  });
  it('falls back to the newest gym session, then to nothing', () => {
    expect(prefillExercises([lower, upper], ['Cardio']).map((e) => e.name)).toEqual(['Squat']);
    expect(prefillExercises([lower, upper], []).map((e) => e.name)).toEqual(['Squat']);
    expect(prefillExercises([], ['Core'])).toEqual([]);
  });
  it('passes over note-only, unfinished, deleted and other sessions', () => {
    const others = [noteOnly, { ...upper, status: 'active' }, { ...lower, deleted: true }, { type: 'strength', status: 'finished', focus: ['Core'] }];
    expect(prefillExercises([...others, upper], ['Core']).map((e) => e.name)).toEqual(['Pull-ups']);
  });
  it('does not share set objects with the old session', () => {
    const out = prefillExercises([upper], ['Core']);
    out[0].sets[0].reps = 99;
    expect(upper.exercises[0].sets[0].reps).toBe(8);
  });
});

describe('gym: sets and summary', () => {
  const ex = [
    { name: 'Pull-ups', unit: 'reps', sets: [set(8), set(8), set(7, 0, false)] },
    { name: 'Plank', unit: 's', sets: [set(60, 0, false)] },
  ];
  it('counts sets', () => {
    expect(setCounts(ex[0])).toEqual({ done: 2, total: 3 });
    expect(doneSets(ex)).toBe(2);
    expect(progressText(ex[0])).toBe('2 of 3 sets done');
    expect(progressText({ sets: [set(1)] })).toBe('1 of 1 set done');
  });
  it('summarises a session for the History list', () => {
    expect(gymSummary(gym({ exercises: ex }))).toBe('Upper body · 2 exercises · 2 sets · 0:52');
    expect(gymSummary(gym({ focus: [], minutes: null, exercises: [ex[1]] }))).toBe('1 exercise · 0 sets');
    expect(gymSummary(gym({ focus: [], minutes: 65, note: '30 min upper body circuit\nfelt strong' }))).toBe('1:05 · 30 min upper body circuit');
    expect(formSummary(gym({ exercises: ex }))).toBe('Upper body · 2 exercises · 2 sets · 0:52');
    expect(hoursMinutes(0)).toBe('0:00');
  });
  it('steps and clamps reps and weight', () => {
    expect(repsStep('reps')).toBe(1);
    expect(repsStep('s')).toBe(10);
    expect(clampReps(-3)).toBe(0);
    expect(clampReps('12')).toBe(12);
    expect(clampReps('x')).toBe(0);
    expect(clampKg('22,5')).toBe(22.5);
    expect(clampKg(-2.5)).toBe(0);
    expect(clampKg(5000)).toBe(1000);
    expect(kgText(0)).toBe('BW');
    expect(kgText(47.5)).toBe('47.5');
  });
  it('adds a set copied from the last one, and moves exercises', () => {
    expect(withAddedSet(ex[0]).sets.at(-1)).toEqual(set(7, 0, false));
    expect(withAddedSet({ name: 'Plank', unit: 's', sets: [] }).sets).toEqual([{ reps: 30, kg: 0, done: false }]);
    expect(newExercise(' Curl ')).toEqual({ name: 'Curl', unit: 'reps', sets: [{ reps: 10, kg: 0, done: false }] });
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});

describe('gym: the session type', () => {
  it('is a session type labelled Gym', () => {
    expect(SESSION_TYPES).toContain('gym');
    expect(TYPE_LABELS.gym).toBe('Gym');
  });
  it('validates focus, exercises and sets', () => {
    expect(validate(gym({ exercises: [{ name: 'Plank', unit: 's', sets: [set(60)] }] }))).toEqual([]);
    expect(validate({ ...emptyGym(), type: 'gym', status: 'finished', date: '2026-11-10', note: 'just a note' })).toEqual([]);
    expect(validate(gym({ focus: ['Yoga'] })).join()).toMatch(/focus/);
    expect(validate(gym({ focus: 2 })).join()).toMatch(/focus/);
    expect(validate(gym({ exercises: null })).join()).toMatch(/list/);
    expect(validate(gym({ exercises: [{ name: ' ', unit: 'reps', sets: [] }] })).join()).toMatch(/name/);
    expect(validate(gym({ exercises: [{ name: 'Row', unit: 'kg', sets: [] }] })).join()).toMatch(/unit/);
    expect(validate(gym({ exercises: [{ name: 'Row', unit: 'reps', sets: [{ reps: 1.5, kg: 0, done: false }] }] })).join()).toMatch(/set 1/);
    expect(validate(gym({ exercises: [{ name: 'Row', unit: 'reps', sets: [{ reps: 10, kg: -1, done: false }] }] })).join()).toMatch(/set 1/);
    expect(validate(gym({ exercises: [{ name: 'Row', unit: 'reps', sets: [{ reps: 10, kg: 0 }] }] })).join()).toMatch(/set 1/);
    expect(validate(gym({ status: 'active' })).join()).toMatch(/finished/);
  });
  it('schema 9 leaves the data unchanged and is refused by apps that only know schema 8', () => {
    expect(SCHEMA_VERSION).toBe(9);
    const v8 = { schemaVersion: 8, collections: { sessions: [{ id: 'a', type: 'strength' }] }, settings: { x: 1 } };
    expect(migrate(v8, 9, migrations)).toEqual({ ...v8, schemaVersion: 9 });
    expect(() => migrate({ schemaVersion: 9 }, 8, migrations)).toThrow(/newer/);
  });
});

describe('gym: pre-fill source', () => {
  it('names the session the exercises come from', () => {
    const a = gym({ focus: ['Core'], exercises: [{ name: 'Plank', unit: 's', sets: [set(60)] }] });
    const b = gym({ focus: ['Cardio'], exercises: [{ name: 'Row', unit: 'reps', sets: [set(10)] }] });
    expect(prefillSource([b, a], ['Core'])).toBe(a);
    expect(prefillSource([b, a], ['Mobility'])).toBe(b);
    expect(prefillSource([], ['Core'])).toBeNull();
  });
});

describe('gym: removing a set', () => {
  const ex = { name: 'Row', unit: 'reps', sets: [set(10, 40), set(10, 45), set(8, 45, false)] };
  it('takes out the last set, or the one given, leaving the others as they are', () => {
    expect(withoutSet(ex).sets).toEqual([set(10, 40), set(10, 45)]);
    expect(withoutSet(ex, 0).sets).toEqual([set(10, 45), set(8, 45, false)]);
    expect(ex.sets).toHaveLength(3);
  });
  it('leaves an exercise without sets as it is', () => {
    expect(withoutSet({ name: 'Plank', unit: 's', sets: [] }).sets).toEqual([]);
    expect(withoutSet(withoutSet({ name: 'Plank', unit: 's', sets: [set(60)] })).sets).toEqual([]);
  });
});

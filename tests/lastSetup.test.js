import { describe, it, expect } from 'vitest';
import { normalizeLastSetup, defaultLastSetup, rememberSetup, lastSetupOf, isGoal } from '../public/js/app/lastSetup.js';
import { migrate, migrations } from '../public/js/storage/migrations.js';
import { collections } from '../public/js/app/collections.js';

describe('last setup per kind', () => {
  it('reads the single object of schema 7 as training and competition', () => {
    const out = normalizeLastSetup({ distance: 25, face: '60', arrowsPerEnd: 6 });
    expect(out.training).toEqual({ distance: 25, face: '60', arrowsPerEnd: 6, grading: true, gear: null });
    expect(out.competition).toEqual({ distance: 25, face: '60', arrowsPerEnd: 6, grading: true, gear: null, round: '', conditions: '' });
    expect(out.blank).toEqual({ goal: null, gear: null });
  });

  it('keeps the M / S grading choice of each kind; a missing or bad one is on', () => {
    const out = normalizeLastSetup({ training: { grading: false }, competition: { grading: 'no' } });
    expect(out.training.grading).toBe(false);
    expect(out.competition.grading).toBe(true);
    expect(rememberSetup({}, 'competition', { grading: false }).lastSetup.competition.grading).toBe(false);
  });

  it('falls back to the defaults for missing or bad values', () => {
    expect(normalizeLastSetup(undefined)).toEqual(defaultLastSetup());
    const out = normalizeLastSetup({ training: { distance: -3, face: 'zz', arrowsPerEnd: 99 }, blank: { goal: 0, gear: 5 } });
    expect(out.training).toEqual(defaultLastSetup().training);
    expect(out.blank).toEqual({ goal: null, gear: null });
  });

  it('a bad face follows the distance\'s usual face', () => {
    expect(normalizeLastSetup({ training: { distance: 70, face: 'zz' } }).training.face).toBe('122');
  });

  it('remembers one kind and keeps the others', () => {
    const settings = { lastSetup: defaultLastSetup() };
    const { lastSetup } = rememberSetup(settings, 'blank', { goal: 60, gear: 'a' });
    expect(lastSetup.blank).toEqual({ goal: 60, gear: 'a' });
    expect(lastSetup.training).toEqual(defaultLastSetup().training);
    expect(lastSetupOf({ lastSetup }, 'blank').goal).toBe(60);
  });

  it('arrow goals are whole numbers from 1 to 10000', () => {
    expect([1, 60, 10000].every(isGoal)).toBe(true);
    expect([0, -1, 1.5, 10001, '60', null].some(isGoal)).toBe(false);
  });
});

describe('migration v8', () => {
  const v7 = (settings) => ({ app: 'archery-performance-journal', schemaVersion: 7, settings, collections: { sessions: [] } });

  it('copies the old single last setup into training and competition', () => {
    const out = migrate(v7({ accent: '#0B6E4F', lastSetup: { distance: 30, face: '80', arrowsPerEnd: 6 } }), 8, migrations);
    expect(out.schemaVersion).toBe(8);
    expect(out.settings.lastSetup).toEqual({
      training: { distance: 30, face: '80', arrowsPerEnd: 6, gear: null },
      competition: { distance: 30, face: '80', arrowsPerEnd: 6, gear: null, round: '', conditions: '' },
      blank: { goal: null, gear: null },
    });
    expect(out.settings.accent).toBe('#0B6E4F');
  });

  it('leaves documents without a last setup, or already per kind, alone', () => {
    expect(migrate(v7({}), 8, migrations).settings).toEqual({});
    expect(migrate({ schemaVersion: 7 }, 8, migrations).settings).toBeUndefined();
    const perKind = { lastSetup: defaultLastSetup() };
    expect(migrate(v7(perKind), 8, migrations).settings).toEqual(perKind);
  });
});

describe('blank bale arrow goal', () => {
  const blank = (extra) => ({ date: '2026-11-16', type: 'blank', status: 'finished', arrows: 40, ...extra });
  const validate = (r) => collections.sessions.validate({ ...collections.sessions.defaults(), ...r });

  it('is optional and must be a whole number from 1 to 10000', () => {
    expect(validate(blank({}))).toEqual([]);
    expect(validate(blank({ goal: null }))).toEqual([]);
    expect(validate(blank({ goal: 60 }))).toEqual([]);
    expect(validate(blank({ goal: 0 }))).toContain('invalid arrow goal');
    expect(validate(blank({ goal: 2.5 }))).toContain('invalid arrow goal');
  });

  it('belongs to blank bale sessions only', () => {
    expect(validate({ ...blank({ goal: 60 }), type: 'manual' })).toContain('invalid arrow goal');
  });
});

import { describe, it, expect } from 'vitest';
import {
  presetOf,
  presetFields,
  drillSummary,
  drillDuration,
  stepValue,
  clampValue,
  hasHold,
} from '../public/js/app/drillView.js';
import { SPT_PRESETS, emptyDrill } from '../public/js/app/sessionTypes.js';

const spt = (sets, reps, holdSec, restSec) => ({ kind: 'spt', sets, reps, holdSec, restSec });

describe('SPT drill card helpers', () => {
  it('knows which drills have a hold', () => {
    expect(hasHold(emptyDrill('spt'))).toBe(true);
    expect(hasHold({ kind: 'hold' })).toBe(true); // retired, still a hold drill
    expect(hasHold(emptyDrill('draw'))).toBe(false);
    expect(hasHold(emptyDrill('band'))).toBe(false);
  });

  it('finds the preset a drill matches (rest = hold), or none', () => {
    expect(presetOf(emptyDrill('spt'))?.label).toBe('10 × 10 s');
    expect(presetOf(spt(1, 6, 20, 20))?.label).toBe('6 × 20 s');
    expect(presetOf(spt(2, 5, 30, 30))?.label).toBe('2 × 5 × 30 s');
    expect(presetOf(spt(2, 5, 30, 20))).toBeNull(); // rest differs
    expect(presetOf(spt(1, 10, 15, 15))).toBeNull();
    expect(presetOf({ kind: 'draw', sets: 1, reps: 10 })).toBeNull();
    for (const p of SPT_PRESETS) expect(presetOf({ kind: 'spt', ...presetFields(p) })).toBe(p);
  });

  it('says what a drill is in one line', () => {
    expect(drillSummary(spt(1, 10, 10, 10))).toBe('10 holds of 10 s, 10 s rest');
    expect(drillSummary(spt(2, 5, 30, 30))).toBe('2 sets × 5 holds of 30 s, 30 s rest');
    expect(drillSummary(spt(1, 1, 20, 0))).toBe('1 hold of 20 s, no rest');
    expect(drillSummary({ kind: 'draw', sets: 1, reps: 10 }, { short: true })).toBe('10 draws');
    expect(drillSummary({ kind: 'draw', sets: 3, reps: 12 })).toBe('3 sets × 12 draws');
    expect(drillSummary({ kind: 'band', sets: 1, reps: 1 })).toBe('1 draw');
    expect(drillSummary({ kind: 'draw', sets: 3, reps: 12 }, { short: true })).toBe('3 sets × 12');
  });

  it('tells how long the timer runs, prepare and set rests included', () => {
    expect(drillDuration(spt(1, 10, 10, 10))).toBe('3:20'); // 10 + 10×10 + 9×10
    expect(drillDuration(spt(1, 6, 20, 20))).toBe('3:50'); // 10 + 120 + 100
    expect(drillDuration(spt(2, 5, 30, 30))).toBe('10:10'); // 10 + 2×(150 + 120) + 60
  });

  it('steps a field within its limits', () => {
    expect(stepValue('sets', 1, -1)).toBe(1);
    expect(stepValue('sets', 10, 1)).toBe(10);
    expect(stepValue('reps', 10, 1)).toBe(11);
    expect(stepValue('holdSec', 10, 1)).toBe(15);
    expect(stepValue('holdSec', 5, -1)).toBe(5);
    expect(stepValue('holdSec', 120, 1)).toBe(120);
    expect(stepValue('restSec', 180, 1)).toBe(180);
    // off the step: to the next step in that direction
    expect(stepValue('holdSec', 12, 1)).toBe(15);
    expect(stepValue('holdSec', 12, -1)).toBe(10);
    // out of range (an older session): back inside
    expect(stepValue('holdSec', 300, -1)).toBe(120);
    expect(stepValue('reps', null, 1)).toBe(1);
  });

  it('keeps a typed value inside the limits', () => {
    expect(clampValue('holdSec', '7')).toBe(7);
    expect(clampValue('holdSec', '1')).toBe(5);
    expect(clampValue('reps', '99')).toBe(30);
    expect(clampValue('reps', '')).toBeNull();
    expect(clampValue('reps', 'abc')).toBeNull();
  });
});

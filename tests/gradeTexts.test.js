import { describe, it, expect } from 'vitest';
import { gradeText, scaleName, isDefault, setGradeText, setScaleName, resetScale, TEXT_MAX, NAME_MAX } from '../public/js/app/gradeTexts.js';
import { RUBRIC } from '../public/js/app/strings.js';

const withTexts = (gradeTexts) => ({ gradeTexts });

describe('gradeText / scaleName', () => {
  it('fall back to the defaults when nothing is stored', () => {
    for (const s of [{}, null, undefined, withTexts(null), withTexts({ m: null }), withTexts({ m: { g: 'junk' } })]) {
      expect(gradeText(s, 'm', 1)).toBe(RUBRIC.m[0]);
      expect(gradeText(s, 's', 5)).toBe(RUBRIC.s[4]);
      expect(scaleName(s, 'm')).toBe('Mental program');
      expect(scaleName(s, 's')).toBe('Shooting cycle');
    }
  });

  it('use the stored wording, and the default for blank or null values', () => {
    const s = withTexts({ m: { name: 'Head', g: [null, 'Mine', '  ', null, null] }, s: null });
    expect(scaleName(s, 'm')).toBe('Head');
    expect(gradeText(s, 'm', 2)).toBe('Mine');
    expect(gradeText(s, 'm', 1)).toBe(RUBRIC.m[0]);
    expect(gradeText(s, 'm', 3)).toBe(RUBRIC.m[2]);
    expect(scaleName(s, 's')).toBe('Shooting cycle');
  });
});

describe('isDefault', () => {
  it('per grade and per scale', () => {
    const s = withTexts(setGradeText(null, 'm', 2, 'Mine'));
    expect(isDefault(s, 'm', 2)).toBe(false);
    expect(isDefault(s, 'm', 1)).toBe(true);
    expect(isDefault(s, 'm')).toBe(false);
    expect(isDefault(s, 's')).toBe(true);
    expect(isDefault(withTexts(setScaleName(null, 's', 'Cycle')), 's')).toBe(false);
  });
});

describe('writing', () => {
  it('stores only what changed', () => {
    expect(setGradeText(null, 'm', 2, 'Mine')).toEqual({ m: { name: null, g: [null, 'Mine', null, null, null] }, s: null });
    expect(setScaleName(null, 's', 'Cycle')).toEqual({ m: null, s: { name: 'Cycle', g: [null, null, null, null, null] } });
  });

  it('turns blanks and the default text back into null', () => {
    const t = setGradeText(null, 'm', 2, 'Mine');
    expect(setGradeText(t, 'm', 2, '')).toBeNull();
    expect(setGradeText(t, 'm', 2, RUBRIC.m[1])).toBeNull();
    expect(setScaleName(setScaleName(null, 'm', 'X'), 'm', 'Mental program')).toBeNull();
  });

  it('trims and caps the length', () => {
    const t = setGradeText(null, 's', 1, `  ${'a'.repeat(100)}  `);
    expect(t.s.g[0]).toHaveLength(TEXT_MAX);
    expect(setScaleName(null, 'm', 'b'.repeat(50)).m.name).toHaveLength(NAME_MAX);
  });

  it('resetScale clears one scale and keeps the other', () => {
    let t = setGradeText(null, 'm', 1, 'One');
    t = setScaleName(t, 's', 'Cycle');
    t = resetScale(t, 'm');
    expect(t).toEqual({ m: null, s: { name: 'Cycle', g: [null, null, null, null, null] } });
    expect(resetScale(t, 's')).toBeNull();
  });

  it('does not change the value it was given', () => {
    const t = setGradeText(null, 'm', 1, 'One');
    const copy = structuredClone(t);
    setGradeText(t, 'm', 2, 'Two');
    resetScale(t, 'm');
    expect(t).toEqual(copy);
  });
});

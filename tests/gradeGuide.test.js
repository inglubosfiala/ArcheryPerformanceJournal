// @vitest-environment happy-dom
// The user's grade wording in the Grading guide.
import { describe, it, expect } from 'vitest';
import { guideSheet } from '../public/js/app/views/common.js';
import { setGradeText, setScaleName } from '../public/js/app/gradeTexts.js';
import { RUBRIC } from '../public/js/app/strings.js';

const edited = { gradeTexts: setScaleName(setGradeText(null, 'm', 2, 'My <b>two</b>'), 's', 'Cycle') };

describe('guideSheet', () => {
  it('uses the scale names and the wording, defaults where unchanged', () => {
    const { node } = guideSheet(() => {}, edited);
    const heads = [...node.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads.slice(1)).toEqual(['Mental program (M)', 'Cycle (S)']);
    const row2 = [...node.querySelectorAll('tbody tr')][1].querySelectorAll('td');
    expect(row2[0].textContent).toBe('My <b>two</b>');
    expect(row2[1].textContent).toBe(RUBRIC.s[1]);
  });

  it('shows the defaults without settings', () => {
    const { node } = guideSheet(() => {});
    expect(node.querySelector('tbody td').textContent).toBe(RUBRIC.m[0]);
  });
});

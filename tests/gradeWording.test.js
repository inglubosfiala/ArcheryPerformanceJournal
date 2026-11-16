// @vitest-environment happy-dom
// Where the user's grade wording shows: the line under the grade buttons and the Grading guide.
import { describe, it, expect } from 'vitest';
import { gradeWording, guideSheet } from '../public/js/app/views/common.js';
import { setGradeText, setScaleName } from '../public/js/app/gradeTexts.js';
import { RUBRIC } from '../public/js/app/strings.js';

const edited = { gradeTexts: setScaleName(setGradeText(null, 'm', 2, 'My <b>two</b>'), 's', 'Cycle') };

describe('gradeWording', () => {
  it('shows the chosen grades with their wording', () => {
    const line = gradeWording(edited, { m: 2, s: 1 });
    expect(line.textContent).toBe(`M2 · My <b>two</b>S1 · ${RUBRIC.s[0]}`);
    expect(line.querySelector('b')).toBeNull(); // text, never HTML
  });

  it('leaves out a scale without a grade, and is empty with none', () => {
    expect(gradeWording({}, { m: null, s: 3 }).textContent).toBe(`S3 · ${RUBRIC.s[2]}`);
    expect(gradeWording({}, { m: null, s: null }).textContent).toBe('');
  });
});

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

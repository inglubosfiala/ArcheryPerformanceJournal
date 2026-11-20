// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderSightsPage } from '../public/js/app/views/gearSights.js';
import { createState } from '../public/js/core/state.js';
import {
  findSightMark,
  markDistance,
  missingDistances,
  sightMarks,
  keyValues,
} from '../public/js/app/gearFields.js';
import { confirmDialog } from '../public/js/app/views/confirm.js';

vi.mock('../public/js/app/views/confirm.js', () => ({ confirmDialog: vi.fn() }));
const control = (root, fk) => root.querySelector(`[data-fk="${fk}"]`);
function context() {
  let setup = {
    id: 'setup',
    fields: { sights: [{ id: 'old', distance: '18 m', elevation: '5', windage: '0', note: '' }] },
  };
  const ctx = {
    repo: { get: () => setup },
    ui: createState(),
    rerender: vi.fn(),
    toast: vi.fn(),
    save: (_collection, value) => (setup = value),
  };
  return { ctx, setup: () => setup, render: () => renderSightsPage(ctx, setup, { header: null }).content };
}

describe('sight distance units', () => {
  it('parses mixed units, orders physical distances and matches rounded session metres', () => {
    const marks = {
      sights: [
        { distance: '20 yd', elevation: '5' },
        { distance: '18m', elevation: '4' },
        { distance: '20 m', elevation: '6' },
      ],
    };
    expect(markDistance(marks.sights[0])).toBeCloseTo(18.288, 8);
    expect(markDistance({ distance: '20.5 yards' })).toBeCloseTo(18.7452, 8);
    expect(markDistance({ distance: '20,5 yd' })).toBeCloseTo(18.7452, 8);
    expect(markDistance({ distance: '70' })).toBe(70);
    expect(markDistance({ distance: '20 feet' })).toBeNull();
    expect(sightMarks(marks).map((m) => m.elevation)).toEqual(['4', '5', '6']);
    expect(findSightMark(marks, 18.288)?.elevation).toBe('5');
    expect(findSightMark(marks, 20)?.elevation).toBe('6');
    expect(missingDistances(marks, 'yd')).not.toContain('20');
    expect(keyValues({ fields: marks }, 18.288)[3].label).toBe('Sight 20 yd');
    expect(findSightMark({ sights: [{ distance: '20.333 yd', elevation: '7' }] }, 18.592495)?.elevation).toBe(
      '7',
    );
  });

  it('remembers the selected entry unit, preserves existing marks and adds a yard mark', () => {
    const { ctx, setup, render } = context();
    control(render(), 'sight-unit-yd').click();
    expect(setup().fields.sightDistanceUnit).toBe('yd');
    expect(setup().fields.sights[0].distance).toBe('18 m');
    let root = render();
    expect(control(root, 'sight-unit-yd').getAttribute('aria-pressed')).toBe('true');
    expect(control(root, 'sight-add-20').textContent).toBe('+ 20 yd');
    control(root, 'sight-add-20').click();
    ctx.ui.quietSet({ sightFocus: null });
    expect(findSightMark(setup().fields, 18.288)?.distance).toBe('20 yd');
    expect(control(render(), 'sight-add-20')).toBeNull();
    control(render(), 'sight-unit-m').click();
    root = render();
    expect(control(root, 'sight-add-30').textContent).toBe('+ 30 m');
    expect(root.textContent).toContain('20 yd');
  });

  it('accepts decimal custom yards and rejects malformed distances without truncating them', async () => {
    const { ctx, setup, render } = context();
    control(render(), 'sight-unit-yd').click();
    confirmDialog.mockImplementation(async ({ body }) => {
      expect(body.textContent).toContain('Distance in yards');
      body.querySelector('input').value = '25,5';
      return true;
    });
    control(render(), 'sight-add-other').click();
    await Promise.resolve();
    ctx.ui.quietSet({ sightFocus: null });
    expect(findSightMark(setup().fields, 23.3172)?.distance).toBe('25.5 yd');
    confirmDialog.mockImplementation(async ({ body }) => {
      body.querySelector('input').value = '25abc';
      return true;
    });
    control(render(), 'sight-add-other').click();
    await Promise.resolve();
    expect(setup().fields.sights).toHaveLength(2);
    expect(ctx.toast).toHaveBeenCalled();
  });
});

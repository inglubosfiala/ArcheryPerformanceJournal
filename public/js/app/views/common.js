// Small shared view pieces.
import { h, todayIso } from '../../core/dom.js';
import { zoneOf } from '../scoring.js';
import { RUBRIC, T } from '../strings.js';
import { icons } from '../icons.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { isScored } from '../sessionTypes.js';
import { datePicker, timePicker } from './pickers.js';

export const scoreChip = (v, extra = '') => h('span', { class: `score-chip z-${zoneOf(v)} ${extra}` }, v == null ? '' : String(v));

export const gradeBadge = (g, extra = '') => h('span', { class: `grade-badge g${g} ${extra}` }, String(g));

export const card = (props, ...children) => h('section', { ...props, class: ['card', props?.class] }, ...children);

export const sectionLabel = (text, id) => h('div', { class: 'section-label', id }, text);

/** The back button, the same on every page: alone on its row, at the right (thumb side). */
export const backBar = (href, label) =>
  h('div', { class: 'back-bar' }, h('a', { class: 'icon-btn', href, 'aria-label': label, dataset: { fk: 'back' } }, icons.back()));

export function chip({ label, sub, pressed, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), onClick, dataset: fk ? { fk } : undefined },
    sub ? [h('span', { class: 'chip-main' }, label), h('span', { class: 'chip-sub' }, sub)] : label,
  );
}

/** Bottom sheet with the full M/S rubric. */
export function guideSheet(onClose) {
  return {
    onClose,
    node: h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' },
      h(
        'div',
        { class: 'sheet-head' },
        h('h2', { class: 'sheet-title', id: 'guide-title' }, T.gradingGuide),
        h(
          'button',
          { type: 'button', class: 'icon-btn round', 'aria-label': 'Close grading guide', onClick: onClose, dataset: { autofocus: '' } },
          icons.close(),
        ),
      ),
      h('p', { class: 'muted small' }, T.guideIntro),
      h(
        'table',
        { class: 'guide-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Grade')), h('th', { scope: 'col' }, T.mentalProgram), h('th', { scope: 'col' }, T.shootingCycle))),
        h(
          'tbody',
          null,
          [1, 2, 3, 4, 5].map((g) => h('tr', null, h('th', { scope: 'row' }, gradeBadge(g)), h('td', null, RUBRIC.m[g - 1]), h('td', null, RUBRIC.s[g - 1]))),
        ),
      ),
    ),
  };
}

/** Dates that already have a session (marked with a dot in the date picker). */
export const sessionDates = (ctx) => new Set(ctx.repo.list('sessions').map((s) => s.date));

/** Date and start time of a finished session, editable in History (a cleared time is removed). */
export function whenCard(ctx, ss) {
  const redraw = ({ status }) => status === 'saved' && ctx.rerender();
  const change = (when) => redraw(ctx.finished.setWhen(ss.id, when));
  return card(
    // no heading: the date and the time speak for themselves
    { 'aria-label': 'When' },
    h(
      'div',
      { class: 'grid-2' },
      datePicker({
        label: 'Date',
        value: ss.date,
        max: todayIso(),
        marks: sessionDates(ctx),
        fk: 'edit-date',
        onChange: (date) => change({ date }),
      }),
      timePicker({
        label: 'Start time',
        value: ss.time || '',
        clearable: true,
        fk: 'edit-time',
        onChange: (time) => change({ time }),
      }),
    ),
    // scored sessions take their duration from the timer; it can be corrected here
    // (the other types have a Duration field in their form)
    isScored(ss.type)
      ? h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Duration'),
          h(
            'div',
            { class: 'input-suffix' },
            h('input', {
              class: 'input',
              type: 'number',
              inputmode: 'numeric',
              min: 0,
              max: 1440,
              value: ss.minutes ?? '',
              dataset: { fk: 'edit-minutes' },
              onChange: (e) => redraw(ctx.finished.setMinutes(ss.id, e.target.value)),
            }),
            h('span', { class: 'muted small' }, 'min'),
          ),
        )
      : null,
  );
}

/** Equipment select for a session (gearChoices output): saved setups by name. */
export function gearPicker({ options, value, onChange }) {
  return h(
    'div',
    { class: 'field' },
    h(
      'select',
      { class: 'input', 'aria-label': 'Equipment', dataset: { fk: 'gear' }, onChange: (e) => onChange(e.target.value) },
      options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
    ),
  );
}

/**
 * The equipment a session used, changeable on the running session and later in History
 * (picking a saved setup copies its fields into the session). `pick(choice)` stores the choice
 * (History passes the finished session's); by default it is stored on the running session here.
 */
export function gearCard(ctx, ss, pick = null) {
  const settings = ctx.repo.getSettings();
  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const choices = gearChoices({ settings, snapshots, session: ss });
  const onChange =
    pick ||
    ((v) => {
      const cur = ctx.repo.get('sessions', ss.id);
      const next = gearForChoice(v, { settings, snapshots });
      if (cur && next && ctx.save('sessions', { ...cur, ...next })) ctx.rerender();
    });
  return card(
    { 'aria-labelledby': 'gear-title' },
    h('h2', { class: 'card-title', id: 'gear-title' }, 'Equipment'),
    gearPicker({ ...choices, onChange }),
  );
}

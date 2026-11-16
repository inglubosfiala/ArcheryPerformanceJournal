// The running blank bale session (#/blank): started from the Shooting page, counted with +1 / +3 / +6
// while you shoot, finished or discarded here. The open form session (openFormSession.js) owns the
// timer, the kept draft, saving and discarding; this page draws them and forwards the taps.
import { h, isoDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { hourMinute } from '../sessionTypes.js';
import { timerElapsed } from '../sessionLogic.js';
import { activeSetup, gearForChoice } from '../gearFields.js';
import { sessionTimer } from './timer.js';


/** Arrows per minute over the time on the timer; null before the first minute or the first arrow. */
export function arrowPace(arrows, elapsedMs) {
  return arrows > 0 && elapsedMs >= 60000 ? arrows / (elapsedMs / 60000) : null;
}

/** The goal line: "12 to go", or "Goal reached". */
export function goalLine(arrows, goal) {
  return arrows >= goal ? 'Goal reached' : `${goal - arrows} to go`;
}

/**
 * The page of an open blank bale session. `open` is its entry of openForms.list() ({ timer, draft }).
 */
export function renderBlankRunning(ctx, open) {
  const { timer } = open;
  const draft = open.draft || { arrows: null, note: '' };
  const count = draft.arrows || 0;
  const goal = draft.goal || null;
  const now = new Date();
  // drafts kept before the Start button existed have no meta: their start is the timer's
  const startedAt = new Date(draft.meta?.startedAt || now.getTime() - timerElapsed(timer, now));
  const setups = ctx.repo.list('setups');
  const gearChoice = draft.meta?.gear ?? activeSetup(ctx.repo.getSettings(), setups)?.id ?? 'none';
  const setupName = gearChoice === 'none' ? null : setups.find((s) => s.id === gearChoice)?.name;

  // the kept draft, read at call time: the note is stored while typing, without a re-render
  const current = () => ctx.openForms.list().find((f) => f.type === 'blank')?.draft || draft;
  const keep = (patch, { rerender = true } = {}) => {
    ctx.openForms.keepDraft('blank', { ...current(), ...patch });
    if (rerender) ctx.rerender();
  };
  const add = (n) => keep({ arrows: Math.max(0, (current().arrows || 0) + n) });
  const toggleTimer = () => {
    ctx.openForms.toggleTimer('blank');
    ctx.rerender();
  };
  const discard = async () => {
    const res = await ctx.openForms.discard('blank');
    if (res.status === 'discarded') ctx.navigate('home', { replace: true });
  };
  const finish = async () => {
    const res = await ctx.openForms.save('blank', {
      fields: current(),
      date: isoDate(startedAt),
      time: hourMinute(startedAt),
      gear: gearForChoice(gearChoice, { setups }) || { gear: null, gearSnapshotId: null },
    });
    if (res.status === 'saved') ctx.navigate(`history/${res.session.id}`, { replace: true });
  };

  const pace = arrowPace(count, timerElapsed(timer, now));
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;

  const header = h(
    'header',
    { class: 'apl apl-header bb-header session-head' },
    APL.IconButton({
      icon: 'back',
      label: 'Back to dashboard — the session keeps running',
      onClick: () => ctx.navigate('home'),
      fk: 'screen-back',
    }),
    h(
      'div',
      { class: 'bb-title' },
      h('h1', null, 'Blank bale'),
      h('span', { class: 'apl-cap' }, [`Started ${hourMinute(startedAt)}`, setupName].filter(Boolean).join(' · ')),
    ),
    sessionTimer(timer, toggleTimer),
  );

  const counter = h(
    'section',
    { class: 'bb-count', 'aria-label': 'Arrow count' },
    h(
      'output',
      { class: 'bb-count-value', 'aria-live': 'polite' },
      h('span', { class: 'bb-count-n' }, String(count)),
      h('span', { class: 'bb-count-unit' }, count === 1 ? 'arrow' : 'arrows'),
    ),
    goal
      ? h(
          'div',
          { class: 'bb-goal' },
          h(
            'div',
            {
              class: 'bb-goal-track',
              role: 'progressbar',
              'aria-label': 'Arrow goal',
              'aria-valuemin': '0',
              'aria-valuemax': String(goal),
              'aria-valuenow': String(Math.min(count, goal)),
            },
            h('div', { class: 'bb-goal-fill', style: { width: `${pct}%` } }),
          ),
          h('div', { class: 'bb-goal-line' }, h('span', null, `Goal ${goal}`), h('span', null, goalLine(count, goal))),
        )
      : null,
    h('span', { class: 'apl-cap13' }, pace == null ? 'Pace shows after the first minute' : `≈ ${pace.toFixed(1)} arrows per minute`),
  );

  const btn = (n, label) =>
    h(
      'button',
      {
        type: 'button',
        class: ['bb-add', n < 0 && 'bb-add--minus'],
        'aria-label': label,
        disabled: n < 0 && count === 0,
        dataset: { fk: n < 0 ? 'arrows-minus-1' : `arrows-add-${n}` },
        onClick: () => add(n),
      },
      n < 0 ? '−1' : `+${n}`,
    );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body bb-body' },
        counter,
        h(
          'div',
          { class: 'bb-adds' },
          btn(-1, 'Remove one arrow'),
          btn(1, 'Add one arrow'),
          btn(3, 'Add three arrows'),
          btn(6, 'Add six arrows'),
        ),
        APL.TextArea({
          label: 'Note',
          rows: 3,
          placeholder: 'Focus of today, feelings, what to keep…',
          value: draft.note || '',
          fk: 'form-note',
          onInput: (e) => keep({ note: e.target.value }, { rerender: false }),
        }),
        h('button', { type: 'button', class: 'btn btn-text danger apl-discard', dataset: { fk: 'discard-form' }, onClick: discard }, 'Discard session'),
      ),
      APL.BottomBar({
        children: APL.Button({ children: `Finish session · ${count} ${count === 1 ? 'arrow' : 'arrows'}`, onClick: finish, fk: 'form-save' }),
      }),
    ),
  };
}

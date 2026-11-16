// The running gym session (#/gym): started from the Gym setup page, its exercises and sets ticked off
// as you go, or just a note; ended with Finish in the header (save, discard or continue, see
// formFinish.js). The open form session (openFormSession.js) owns the timer, the kept draft (so a
// reload keeps everything), saving and discarding; this page draws them and forwards the taps.
import { h, isoDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { hourMinute, newestFirst } from '../sessionTypes.js';
import { timerElapsed, formatClock } from '../sessionLogic.js';
import { doneSets, emptyGym } from '../gym.js';
import { sessionTimer } from './timer.js';
import { gymExercises } from './gymForm.js';
import { formFinish } from './formFinish.js';

/** The page of an open gym session. `open` is its entry of openForms.list() ({ timer, draft }). */
export function renderGymRunning(ctx, open) {
  const { timer } = open;
  const draft = open.draft || emptyGym();
  const meta = draft.meta || {};
  const now = new Date();
  const startedAt = new Date(meta.startedAt || now.getTime() - timerElapsed(timer, now));
  const date = meta.date || isoDate(startedAt);
  const time = meta.time || hourMinute(startedAt);
  const past = !!meta.past;

  // the kept draft, read at call time: the note is stored while typing, without a re-render
  const current = () => ctx.openForms.list().find((f) => f.type === 'gym')?.draft || draft;
  const change = (update, { rerender = true } = {}) => {
    const cur = current();
    ctx.openForms.keepDraft('gym', { ...cur, ...update(cur) });
    if (rerender) ctx.rerender();
  };
  const toggleTimer = () => {
    ctx.openForms.toggleTimer('gym');
    ctx.rerender();
  };
  const closeUi = () => ctx.ui.quietSet({ gymMenu: null, gymRename: null, gymOther: null });
  const discard = async () => {
    const res = await ctx.openForms.discard('gym');
    if (res.status !== 'discarded') return res;
    closeUi();
    ctx.navigate('home', { replace: true });
    return res;
  };
  const finish = async () => {
    const res = await ctx.openForms.save('gym', { fields: current(), date, time, past });
    if (res.status !== 'saved') return res;
    closeUi();
    ctx.navigate(`history/${res.session.id}`, { replace: true });
    return res;
  };

  const sessions = ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'gym');
  const sets = doneSets(draft.exercises);
  const exerciseCount = (draft.exercises || []).length;
  const subtitle = [(draft.focus || []).join(' · ') || null, past ? `logged afterwards · ${time}` : `started ${time}`]
    .filter(Boolean)
    .join(' · ');

  // Finish in the header: End the session (save · discard · continue), as on the scoring screen
  const clock = past ? null : formatClock(timerElapsed(timer, now));
  const exercisesText = `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  const setsText = `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  const ending = formFinish(ctx, 'gym', {
    summary: [exercisesText, `${setsText} done`, clock].filter(Boolean).join(' · '),
    save: finish,
    discard,
  });

  const header = h(
    'header',
    { class: 'apl apl-header bb-header session-head' },
    APL.IconButton({
      icon: 'back',
      label: 'Back to dashboard — the session keeps running',
      onClick: () => ctx.navigate('home'),
      fk: 'screen-back',
    }),
    h('div', { class: 'bb-title' }, h('h1', null, 'Gym'), h('span', { class: 'apl-cap' }, subtitle)),
    // logged afterwards: no clock, the duration is typed in on the saved session
    past ? null : sessionTimer(timer, toggleTimer),
    ending.button,
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body gym-body' },
        ...gymExercises(draft, change, { sessions, ui: ctx.ui }),
        APL.TextArea({
          label: 'Note',
          rows: 3,
          placeholder: 'Or just write what you did…',
          value: draft.note || '',
          fk: 'form-note',
          onInput: (e) => change(() => ({ note: e.target.value }), { rerender: false }),
        }),
      ),
    ),
    overlay: ending.overlay,
  };
}

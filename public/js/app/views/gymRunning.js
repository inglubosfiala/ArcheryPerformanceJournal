// The running gym session (#/gym): started from the Gym setup page, its exercises and sets ticked off
// as you go, or just a note; finished or discarded here. The open form session (openFormSession.js)
// owns the timer, the kept draft (so a reload keeps everything), saving and discarding; this page
// draws them and forwards the taps.
import { h, isoDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { hourMinute, newestFirst } from '../sessionTypes.js';
import { timerElapsed } from '../sessionLogic.js';
import { doneSets, emptyGym } from '../gym.js';
import { sessionTimer } from './timer.js';
import { gymExercises } from './gymForm.js';

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
    if (res.status !== 'discarded') return;
    closeUi();
    ctx.navigate('home', { replace: true });
  };
  const finish = async () => {
    const res = await ctx.openForms.save('gym', { fields: current(), date, time, past });
    if (res.status !== 'saved') return;
    closeUi();
    ctx.navigate(`history/${res.session.id}`, { replace: true });
  };

  const sessions = ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'gym');
  const sets = doneSets(draft.exercises);
  const subtitle = [(draft.focus || []).join(' · ') || null, past ? `logged afterwards · ${time}` : `started ${time}`]
    .filter(Boolean)
    .join(' · ');

  const header = h(
    'header',
    { class: 'apl apl-header bb-header' },
    APL.IconButton({
      icon: 'back',
      label: 'Back to dashboard — the session keeps running',
      onClick: () => ctx.navigate('home'),
      fk: 'screen-back',
    }),
    h('div', { class: 'bb-title' }, h('h1', null, 'Gym'), h('span', { class: 'apl-cap' }, subtitle)),
    // logged afterwards: no clock, the duration is typed in on the saved session
    past ? null : sessionTimer(timer, toggleTimer),
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
        h('button', { type: 'button', class: 'btn btn-text danger apl-discard', dataset: { fk: 'discard-form' }, onClick: discard }, 'Discard session'),
      ),
      APL.BottomBar({
        children: APL.Button({ children: `Finish session · ${sets} ${sets === 1 ? 'set' : 'sets'}`, onClick: finish, fk: 'form-save' }),
      }),
    ),
  };
}

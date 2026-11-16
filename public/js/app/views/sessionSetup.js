// New session: the parts shared by the setup pages (the setup being picked, When, Equipment) and the
// form of SPT, mental and manual sessions, drawn with the APL components. Step 1 and the Shooting page
// are in shootingSetup.js. The running-session and open-form-session modules own starting, saving and
// discarding; these pages hold what is being picked (ui state `setup`).
import { h, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import * as L from '../sessionLogic.js';
import { lastSetupOf } from '../lastSetup.js';
import { TYPE_LABELS, hourMinute, newestFirst } from '../sessionTypes.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { sessionDates, gearCards } from './common.js';
import { datePicker, timePicker } from './pickers.js';
import { emptyForm, formSections, showsStartTimer } from './sessionForms.js';
import { sessionTimer } from './timer.js';
import { formFinish } from './formFinish.js';

// ---------------------------------------------------------------- shared by the setup pages

/**
 * The setup being picked (ui state `setup`): `when`, `pastMinutes` and `gear` are shared by every
 * setup page (switching the kind of shooting keeps them); the Shooting page keeps each kind's own
 * fields in `kinds[kind]`, the form pages their drafts in `forms[type]`.
 */
export function setupState(ctx) {
  const settings = ctx.repo.getSettings();
  const setup = ctx.ui.get().setup || {};
  return {
    settings,
    setup,
    set: (patch) => ctx.ui.set({ setup: { ...setup, ...patch } }),
    // typing in a text field stores the draft without re-rendering, so the field keeps focus
    quiet: (patch) => ctx.ui.quietSet({ setup: Object.assign(setup, patch) }),
  };
}

/**
 * When: now by default; an earlier date / time logs the session afterwards (no running timer).
 * Fields left untouched follow the clock, so a draft kept open is not dated when it was opened.
 * `duration`: a scored session logged afterwards asks for its duration here.
 */
export function whenSection(ctx, { setup, set, quiet }, { duration = false } = {}) {
  const when = setup.when || {};
  const whenDate = when.date || todayIso();
  const whenTime = when.time || hourMinute(new Date());
  const past = L.isPastStart(whenDate, whenTime);
  const setWhen = (patch) => set({ when: { ...when, ...patch } });
  const section = APL.Section({
    label: 'When',
    id: 'setup-when',
    // "Now" (back to the present) shows only after the date or the time was changed
    accessory:
      when.date || when.time
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-text btn-sm',
              dataset: { fk: 'when-now' },
              onClick: () => set({ when: null, pastMinutes: null }),
            },
            'Now',
          )
        : null,
    children: [
      h(
        'div',
        { class: 'apl-grid-2' },
        datePicker({
          label: 'Date',
          value: whenDate,
          max: todayIso(),
          marks: sessionDates(ctx),
          fk: 'when-date',
          onChange: (date) => setWhen({ date }),
        }),
        timePicker({
          label: 'Start time',
          value: whenTime,
          fk: 'when-time',
          hint: when.time ? 'Start time' : 'Now',
          onChange: (time) => time && setWhen({ time }),
        }),
      ),
      past && duration
        ? APL.TextField({
            label: 'Duration',
            type: 'number',
            inputmode: 'numeric',
            min: 0,
            suffix: 'min',
            value: setup.pastMinutes ?? '',
            fk: 'past-minutes',
            onInput: (e) => {
              const n = parseInt(e.target.value, 10);
              quiet({ pastMinutes: Number.isFinite(n) && n >= 0 ? n : null });
            },
          })
        : null,
      past ? h('p', { class: 'apl-cap' }, 'Logged afterwards: no running timer.') : null,
    ],
  });
  return { section, whenDate, whenTime, past };
}

/**
 * Equipment, as cards. Until one is picked on the page, the last session of `kind` decides (when its
 * setup still exists), else the active setup.
 */
export function equipmentSection(ctx, { settings, setup, set }, { kind = null, distance = null } = {}) {
  const setups = ctx.repo.list('setups');
  const gearOpts = gearChoices({ settings, setups });
  const valid = (id) => gearOpts.options.some((o) => o[0] === id);
  const remembered = kind ? lastSetupOf(settings, kind).gear : null;
  const gearChoice = valid(setup.gear) ? setup.gear : valid(remembered) ? remembered : gearOpts.value;
  const section = APL.Section({
    label: 'Equipment',
    id: 'setup-gear',
    children: gearCards(ctx, { ...gearOpts, value: gearChoice, onChange: (id) => set({ gear: id }), setups, distance }),
  });
  return {
    section,
    choice: gearChoice,
    chosenGear: () => gearForChoice(gearChoice, { setups }) || { gear: null, gearSnapshotId: null },
    gearName: gearChoice === 'none' ? null : gearOpts.options.find((o) => o[0] === gearChoice)?.[1],
  };
}

// ---------------------------------------------------------------- form session

/**
 * The form of an SPT, mental or manual session, saved straight to History. SPT and mental are timed:
 * opening the form starts their timer (a blank bale starts from the Shooting page instead).
 */
export function renderFormSetup(ctx, type) {
  const st = setupState(ctx);
  const { setup, set, quiet } = st;
  const { section: when, whenDate, whenTime, past } = whenSection(ctx, st);
  // equipment is not asked for mental and SPT sessions: the bow's setup says nothing about them
  const noGear = type === 'mental' || type === 'strength';
  const equipment = noGear ? null : equipmentSection(ctx, st);

  // The open form session (openFormSession.js) owns the timer, the kept draft, saving and
  // discarding; this page holds the draft being typed and forwards the events.
  // Opening gives a timed form its timer and, when the page has no draft yet, the kept one.
  const opened = ctx.openForms.open(type, setup.forms?.[type] || null);
  if (opened.draft && !setup.forms?.[type]) quiet({ forms: { ...setup.forms, [type]: opened.draft } });
  const { timed, timer: formTimer } = opened;
  const form = setup.forms?.[type] || emptyForm(type);
  // the draft is read at call time: typing stores into `setup` without re-rendering
  const currentForm = () => setup.forms?.[type] || emptyForm(type);
  const changeForm = (update, { rerender = true } = {}) => {
    const cur = currentForm();
    const forms = { ...setup.forms, [type]: { ...cur, ...update(cur) } };
    ctx.openForms.keepDraft(type, forms[type]);
    if (rerender) set({ forms });
    else quiet({ forms });
  };
  const toggleFormTimer = () => {
    ctx.openForms.toggleTimer(type);
    ctx.rerender();
  };
  // the form session is over: the page's draft goes too
  const dropPageDraft = () =>
    ctx.ui.quietSet({ setup: { ...setup, when: null, forms: { ...setup.forms, [type]: null } } });

  const discardForm = async () => {
    const res = await ctx.openForms.discard(type);
    if (res.status !== 'discarded') return res;
    dropPageDraft();
    ctx.navigate('home', { replace: true });
    return res;
  };

  const saveForm = async () => {
    const res = await ctx.openForms.save(type, {
      fields: currentForm(),
      date: whenDate,
      time: whenTime,
      past,
      gear: noGear ? {} : equipment.chosenGear(),
    });
    if (res.status !== 'saved') return res;
    dropPageDraft();
    ctx.navigate(`history/${res.session.id}`, { replace: true });
    return res;
  };

  // a timed form whose start is not in the past: its timer runs, it is a running session
  const running = timed && !past;
  // SPT: the timer in the page header, next to the title; mental: a "Timer" row
  const sptRunning = running && type === 'strength';
  const timerRow =
    running && !sptRunning
        ? h(
            'div',
            { class: 'apl-section-head' },
            h('h2', { class: 'apl-label' }, 'Timer'),
            sessionTimer(formTimer, toggleFormTimer),
          )
        : null;

  // no back button on a running SPT session (Finish ends it; the tab bar leaves it running)
  const back = !(running && type === 'strength');
  // the manual type is offered as "Log afterwards"
  const title = type === 'manual' ? 'Log afterwards' : `${TYPE_LABELS[type]} session`;
  // a drill card's own green "Start timer" is the primary action while it shows: Save steps down
  const saveVariant = type === 'strength' && showsStartTimer(form.drills) ? 'secondary' : 'primary';

  // a running SPT session ends as the scoring screen does: Finish in the header opens End the
  // session (save · discard · continue), instead of Save at the bottom and Discard in the page
  const drills = form.drills || [];
  const doneDrills = drills.filter((d) => d.done).length;
  const clock = L.formatClock(L.timerElapsed(formTimer));
  const ending = sptRunning
    ? formFinish(ctx, type, {
        summary: [`${drills.length} ${drills.length === 1 ? 'drill' : 'drills'}`, `${doneDrills} done`, clock].join(' · '),
        facts: [
          [String(drills.length), drills.length === 1 ? 'drill' : 'drills'],
          [String(doneDrills), 'done'],
          [clock, 'on the timer'],
        ],
        save: saveForm,
        discard: discardForm,
      })
    : null;

  const header = APL.ScreenHeader({
    title,
    onBack: back ? () => ctx.navigate('new') : null,
    backLabel: 'Back to session type',
    trailing: sptRunning
      ? h('span', { class: 'form-head-actions' }, sessionTimer(formTimer, toggleFormTimer), ending.button)
      : null,
  });
  // a running session's top bar stays on screen while the page scrolls
  if (running) header.classList.add('session-head');

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body' },
        when,
        timerRow,
        ...formSections(type, form, changeForm, {
          live: running,
          // SPT: a new drill starts from the numbers last used in a saved session
          pastSessions:
            type === 'strength'
              ? ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'strength')
              : [],
        }),
        equipment?.section,
        running && !sptRunning
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text danger apl-discard',
                dataset: { fk: 'discard-form' },
                onClick: discardForm,
              },
              'Discard session',
            )
          : null,
      ),
      sptRunning
        ? null
        : APL.BottomBar({
            children: APL.Button({ children: 'Save session', variant: saveVariant, onClick: saveForm, fk: 'form-save' }),
          }),
    ),
    overlay: ending?.overlay ?? null,
  };
}

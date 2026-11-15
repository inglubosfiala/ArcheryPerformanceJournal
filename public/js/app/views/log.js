// Log tab: new session setup → arrow-by-arrow logging with the M/S grading sheet (HANDOFF §3).
import { h, s, todayIso } from '../../core/dom.js';
import { confirmDialog } from './confirm.js';
import {
  DISTANCES,
  SETUP_FACES,
  ARROWS_PER_END_MIN,
  ARROWS_PER_END_MAX,
  DEFAULT_ARROWS_PER_END,
  DISTANCE_DEFAULTS,
  faceLabel,
  scoreFromPoint,
  locateOnSheet,
  sheetPoint,
  isMultiSpot,
  spotCentres,
  zoneOf,
} from '../scoring.js';
import { sumArrows, computeStats, fmt } from '../stats.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, chip, sectionLabel, gearPicker, gearCard, sessionDates, backBar } from './common.js';
import { datePicker, timePicker } from './pickers.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { faceSheet, faceViewBox, VB } from './face.js';
import { SESSION_TYPES, TYPE_LABELS, isScored, hourMinute, sessionType } from '../sessionTypes.js';
import { emptyForm, formSections } from './sessionForms.js';
import { detectArrows } from '../photoDetect.js';
import { arrowMarkLayout, drawArrowMarks, liveScan } from './liveScan.js';

export function findActive(repo) {
  return repo.list('sessions', { filter: (x) => x.status === 'active' })[0] || null;
}

/**
 * Blank bale / strength / mental sessions open on this device (opened, not saved or discarded, and
 * touched recently): their type, timer and kept draft.
 */
export function openFormSessions(settings, now = new Date()) {
  const timers = settings.formTimers || {};
  return SESSION_TYPES.filter((t) => !isScored(t) && t !== 'manual' && L.isFormTimerLive(timers[t], now)).map((t) => ({
    type: t,
    timer: timers[t],
    draft: settings.formDrafts?.[t] || null,
  }));
}

export function logSubtitle(repo) {
  const a = findActive(repo);
  return a
    ? `${a.type === 'competition' ? 'Competition · ' : ''}${a.distance} m · ${faceLabel(a.face)} · ${a.arrowsPerEnd} arrows/end`
    : T.sub.logIdle;
}

export function renderLog(ctx) {
  const active = findActive(ctx.repo);
  // no session running (e.g. it was just finished or discarded): choose a type for a new one
  return active ? renderActive(ctx, active) : renderTypeChoice(ctx);
}

/** New-session setup, reachable from the bottom bar even while a session is in progress. */
/** New session: step 1 picks the type (#/new), step 2 asks that type's details (#/new/<type>). */
export function renderNewSession(ctx, params = []) {
  const type = params[0];
  if (SESSION_TYPES.includes(type)) return renderSetup(ctx, type, findActive(ctx.repo));
  return renderTypeChoice(ctx);
}

const TYPE_HINTS = {
  training: 'Score arrow by arrow with M / S grades',
  blank: 'Count arrows at the blank bale, no score',
  competition: 'Scored like training, with event and placement',
  strength: 'SPT, holding and draw drills, effort',
  mental: 'Visualisation, breathing, shot routine…',
  manual: 'Type in the arrows or the duration afterwards',
};

function renderTypeChoice(ctx) {
  // tapping a type opens it straight away; the last one picked is marked
  const last = ctx.ui.get().newType;
  return {
    content: h(
      'div',
      { class: 'stack' },
      backBar('#/home', 'Back to dashboard'),
      h('h1', { class: 'page-title sm' }, T.newSession),
      card(
        { class: 'setup-card', 'aria-label': 'Session type' },
        sectionLabel('Session type'),
        h(
          'nav',
          { class: 'type-list', 'aria-label': 'Session type' },
          SESSION_TYPES.map((t) =>
            h(
              'a',
              {
                class: ['type-option', last === t && 'is-last'],
                href: `#/new/${t}`,
                dataset: { fk: `type-${t}` },
                onClick: () => ctx.ui.quietSet({ newType: t }),
              },
              h(
                'span',
                { class: 'type-option-text' },
                h('span', { class: 'type-option-title' }, TYPE_LABELS[t]),
                h('span', { class: 'type-option-sub' }, TYPE_HINTS[t]),
              ),
              h('span', { class: 'type-option-go', 'aria-hidden': 'true' }, icons.forward()),
            ),
          ),
        ),
      ),
    ),
  };
}

/** Apply a session transition to the stored active session and persist it. */
function update(ctx, fn, { rerender = true } = {}) {
  const cur = findActive(ctx.repo);
  if (!cur) return;
  const next = fn(cur);
  if (next === cur) return;
  if (ctx.save('sessions', next) && rerender) ctx.rerender();
}

// ---------------------------------------------------------------- new session

function renderSetup(ctx, type, active = null) {
  const settings = ctx.repo.getSettings();
  // distance and face are remembered from the last session; arrows per end always start at the default
  const last = settings.lastSetup;
  // a face no longer offered (the single 40 cm 10–6 spot) falls back to the triple
  const setup = ctx.ui.get().setup || {
    distance: last.distance,
    face: SETUP_FACES.includes(last.face) ? last.face : '40t',
    arrowsPerEnd: DEFAULT_ARROWS_PER_END,
    competition: { event: '', round: '', conditions: '' },
  };
  const set = (patch) => ctx.ui.set({ setup: { ...setup, ...patch } });
  // typing in a text field stores the draft without re-rendering, so the field keeps focus
  const quiet = (patch) => ctx.ui.quietSet({ setup: Object.assign(setup, patch) });
  // a remembered distance that is not in the list (e.g. 90 m) steps from the nearest listed one
  const distIndex = DISTANCES.reduce(
    (best, d, i) => (Math.abs(d - setup.distance) < Math.abs(DISTANCES[best] - setup.distance) ? i : best),
    0,
  );

  // When: now by default; an earlier date / time logs the session afterwards (no running timer).
  // Fields left untouched follow the clock, so a draft kept open is not dated when it was opened.
  const when = setup.when || {};
  const whenDate = when.date || todayIso();
  const whenTime = when.time || hourMinute(new Date());
  const past = L.isPastStart(whenDate, whenTime);
  const setWhen = (patch) => set({ when: { ...when, ...patch } });
  const whenSection = h(
    'section',
    { class: 'setup-section', 'aria-labelledby': 'lbl-when' },
    h(
      'div',
      { class: 'spread align-center' },
      sectionLabel('When', 'lbl-when'),
      when.date || when.time
        ? h('button', { type: 'button', class: 'btn btn-text btn-sm', dataset: { fk: 'when-now' }, onClick: () => set({ when: null, pastMinutes: null }) }, 'Now')
        : null,
    ),
    h(
      'div',
      { class: 'grid-2' },
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
        onChange: (time) => time && setWhen({ time }),
      }),
    ),
    // a scored session logged afterwards: its duration is typed in, the timer stays stopped
    past && isScored(type)
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
              value: setup.pastMinutes ?? '',
              dataset: { fk: 'past-minutes' },
              onInput: (e) => {
                const n = parseInt(e.target.value, 10);
                quiet({ pastMinutes: Number.isFinite(n) && n >= 0 ? n : null });
              },
            }),
            h('span', { class: 'muted small' }, 'min'),
          ),
        )
      : null,
    past ? h('p', { class: 'muted small' }, 'Logged afterwards: no running timer.') : null,
  );

  // equipment: the Gear tab's setup by default, or any saved setup (not asked for mental sessions)
  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const gearOpts = gearChoices({ settings, snapshots });
  const gearChoice = gearOpts.options.some((o) => o[0] === setup.gear) ? setup.gear : gearOpts.value;
  const chosenGear = () => gearForChoice(gearChoice, { settings, snapshots }) || { gear: null, gearSnapshotId: null };
  const gearSection =
    type === 'mental'
      ? null
      : h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-gear' },
          sectionLabel('Equipment', 'lbl-gear'),
          gearPicker({
            ...gearOpts,
            value: gearChoice,
            onChange: (v) => set({ gear: v }),
          }),
        );

  const start = async () => {
    // Only one session runs at a time: an in-progress session is finished (saved ends kept) or,
    // if it has no saved ends, discarded.
    const running = findActive(ctx.repo);
    if (running) {
      const finish = L.canFinish(running);
      const ok = await confirmDialog({
        title: 'A session is in progress',
        message: finish ? T.confirmReplaceFinish : T.confirmReplaceDiscard,
        confirmLabel: finish ? 'Finish & start' : 'Discard & start',
        danger: !finish,
      });
      if (!ok) return;
      if (L.canFinish(running)) {
        if (!ctx.save('sessions', L.finishSession(running))) return;
      } else if (!ctx.remove('sessions', running.id)) return;
    }
    const { distance, face, arrowsPerEnd } = setup;
    ctx.repo.saveSettings({ lastSetup: { distance, face, arrowsPerEnd } });
    const session = L.createSession({
      date: whenDate,
      time: whenTime,
      pastMinutes: past ? (setup.pastMinutes ?? 0) : null,
      type,
      distance,
      face,
      arrowsPerEnd,
      competition: type === 'competition' ? { ...setup.competition, placement: '' } : null,
      ...chosenGear(),
    });
    ctx.ui.quietSet({ setup: null });
    if (ctx.save('sessions', session)) ctx.navigate('log', { replace: true });
  };

  const compField = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('input', {
        class: 'input',
        value: setup.competition?.[key] || '',
        placeholder,
        autocomplete: 'off',
        dataset: { fk: `comp-${key}` },
        onInput: (e) => quiet({ competition: { ...setup.competition, [key]: e.target.value } }),
      }),
    );

  // strength / mental: a form saved straight to History
  // Timed forms keep their draft (e.g. the blank bale count) in this device's settings too, so it
  // survives leaving the page or the app being closed; it is taken back while its timer is live.
  const timedType = !isScored(type) && type !== 'manual';
  const keptDraft = settings.formDrafts?.[type];
  if (timedType && !setup.forms?.[type] && keptDraft && L.isFormTimerLive(settings.formTimers?.[type])) {
    quiet({ forms: { ...setup.forms, [type]: keptDraft } });
  }
  const form = setup.forms?.[type] || emptyForm(type);
  // the draft is read at call time: typing stores into `setup` without re-rendering
  const currentForm = () => setup.forms?.[type] || emptyForm(type);
  const changeForm = (update, { rerender = true } = {}) => {
    const cur = currentForm();
    const forms = { ...setup.forms, [type]: { ...cur, ...update(cur) } };
    if (timedType) ctx.repo.saveSettings({ formDrafts: { ...(ctx.repo.getSettings().formDrafts || {}), [type]: forms[type] } });
    if (rerender) set({ forms });
    else quiet({ forms });
  };
  // Blank bale / strength / mental: a timer starts when the form opens. It is kept in this device's
  // settings (not synced), so it survives the app being closed, and fills in the duration on save.
  const formTimers = settings.formTimers || {};
  // A timer left behind by a form that was opened but never saved starts again after some hours.
  // Manual sessions are typed in afterwards and have no timer.
  const timed = timedType;
  let formTimer = formTimers[type];
  if (timed) {
    const opened = L.openFormTimer(formTimer);
    if (opened !== formTimer) ctx.repo.saveSettings({ formTimers: { ...formTimers, [type]: opened } });
    formTimer = opened;
  }
  const toggleFormTimer = () => {
    const all = ctx.repo.getSettings().formTimers || {};
    const cur = { timer: all[type] };
    const next = cur.timer?.running ? L.pauseTimer(cur) : L.resumeTimer(cur);
    ctx.saveSettings({ formTimers: { ...all, [type]: { ...next.timer, touchedAt: new Date().toISOString() } } });
    ctx.rerender();
  };

  const timerMinutes = () => {
    const all = ctx.repo.getSettings().formTimers || {};
    return timed && !past && all[type] ? Math.round(L.timerElapsed(all[type]) / 60000) : null;
  };

  const formTimerRunning = () => !!(ctx.repo.getSettings().formTimers || {})[type]?.running;

  // Save asks only OK / Cancel; the duration (from the timer) and the note are then edited on the
  // session's History page, which opens next. The timer is paused while the question is open and
  // runs on again if it is cancelled.
  const confirmSave = async () => {
    const wasRunning = timed && !past && formTimerRunning();
    if (wasRunning) toggleFormTimer();
    const fields = currentForm();
    const minutes = fields.minutes ?? timerMinutes();
    const facts = [
      type === 'blank' || type === 'manual' ? `${fields.arrows || 0} ${fields.arrows === 1 ? 'arrow' : 'arrows'}` : null,
      minutes != null ? `${minutes} min` : null,
    ].filter(Boolean);
    const ok = await confirmDialog({
      title: 'Save session?',
      message: `${TYPE_LABELS[type]}${facts.length ? ` · ${facts.join(' · ')}` : ''}. The duration and a note can be changed on the next page.`,
      confirmLabel: 'OK',
      icon: 'check',
    });
    if (!ok && wasRunning && !formTimerRunning()) toggleFormTimer();
    return ok;
  };

  // drop the open session without saving it: timer, kept draft and page draft
  const discardForm = async () => {
    const ok = await confirmDialog({
      title: 'Discard session?',
      message: `This ${TYPE_LABELS[type].toLowerCase()} session is not saved, and its timer stops.`,
      confirmLabel: 'Discard',
      danger: true,
    });
    if (!ok) return;
    const { formTimers: all = {}, formDrafts = {} } = ctx.repo.getSettings();
    ctx.repo.saveSettings({ formTimers: { ...all, [type]: null }, formDrafts: { ...formDrafts, [type]: null } });
    ctx.ui.quietSet({ setup: { ...setup, when: null, forms: { ...setup.forms, [type]: null } } });
    ctx.navigate('home', { replace: true });
  };

  const saveForm = async () => {
    if (!(await confirmSave())) return;
    const fields = currentForm();
    // minutes typed by hand win over the timer
    const minutes = fields.minutes ?? timerMinutes();
    const all = ctx.repo.getSettings().formTimers || {};
    const gear = type === 'mental' ? {} : chosenGear();
    const saved = ctx.save('sessions', { type, status: 'finished', ...fields, date: whenDate, time: whenTime, minutes, ...gear });
    if (!saved) return;
    if (timed) {
      const { formDrafts = {} } = ctx.repo.getSettings();
      ctx.repo.saveSettings({ formTimers: { ...all, [type]: null }, formDrafts: { ...formDrafts, [type]: null } });
    }
    ctx.ui.quietSet({ setup: { ...setup, when: null, forms: { ...setup.forms, [type]: null } } });
    ctx.navigate(`history/${saved.id}`, { replace: true });
  };

  const body = isScored(type)
    ? [
        whenSection,
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-dist' },
          sectionLabel(T.distance, 'lbl-dist'),
          stepper({
            label: 'distance',
            value: `${setup.distance} m`,
            canDown: distIndex > 0,
            canUp: distIndex < DISTANCES.length - 1,
            fk: 'dist',
            onStep: (dir) => {
              const d = DISTANCES[distIndex + dir];
              set({ distance: d, ...DISTANCE_DEFAULTS[d] });
            },
          }),
        ),
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-face' },
          sectionLabel(T.targetFace, 'lbl-face'),
          h(
            'div',
            { class: 'grid-3' },
            SETUP_FACES.map((f) =>
              chip({
                label: faceLabel(f),
                pressed: setup.face === f,
                fk: `face-${f}`,
                onClick: () => set({ face: f }),
              }),
            ),
          ),
        ),
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-n' },
          sectionLabel(T.arrowsPerEnd, 'lbl-n'),
          stepper({
            label: 'arrows',
            value: `${setup.arrowsPerEnd} arrows`,
            canDown: setup.arrowsPerEnd > ARROWS_PER_END_MIN,
            canUp: setup.arrowsPerEnd < ARROWS_PER_END_MAX,
            fk: 'n',
            onStep: (dir) => set({ arrowsPerEnd: setup.arrowsPerEnd + dir }),
          }),
        ),
        type === 'competition'
          ? h(
              'section',
              { class: 'setup-section', 'aria-label': 'Competition' },
              sectionLabel('Competition'),
              compField('event', 'Event', 'e.g. Indoor Cup Bratislava'),
              h(
                'div',
                { class: 'grid-2' },
                compField('round', 'Round', 'e.g. WA 18 m'),
                compField('conditions', 'Conditions', 'hall, wind, light'),
              ),
            )
          : null,
        gearSection,
        h('button', { type: 'button', class: 'btn btn-primary btn-xl', onClick: start }, T.start),
      ]
    : [
        whenSection,
        // blank bale: the timer sits beside the arrow count (in the form), without a label
        timed && !past && type !== 'blank'
          ? h(
              'div',
              { class: 'spread align-center' },
              h('span', { class: 'field-label' }, 'Timer'),
              timerButton(formTimer, toggleFormTimer),
            )
          : null,
        ...formSections(type, form, changeForm, {
          live: timed && !past,
          timer: type === 'blank' && timed && !past ? timerButton(formTimer, toggleFormTimer, { large: true }) : null,
        }),
        gearSection,
        h('button', { type: 'button', class: 'btn btn-primary btn-xl', onClick: saveForm }, 'Save session'),
        timed && !past
          ? h('button', { type: 'button', class: 'btn btn-text danger', dataset: { fk: 'discard-form' }, onClick: discardForm }, 'Discard session')
          : null,
      ];

  return {
    content: h(
      'div',
      { class: 'stack' },
      backBar('#/new', 'Back to session type'),
      h('h1', { class: 'page-title sm' }, `${TYPE_LABELS[type]} session`),
      active && isScored(type)
        ? h(
            'div',
            { class: 'banner', role: 'status' },
            h(
              'span',
              null,
              T.inProgress(`${active.distance} m · ${faceLabel(active.face)}`, active.ends.length),
            ),
            h('a', { class: 'btn btn-primary btn-sm', href: '#/log' }, T.continueSession),
          )
        : null,
      card({ class: 'setup-card' }, body),
    ),
  };
}

/** − value + control for the setup card. */
function stepper({ label, value, canDown, canUp, fk, onStep }) {
  return h(
    'div',
    { class: 'stepper', role: 'group' },
    h(
      'button',
      {
        type: 'button',
        'aria-label': `Less ${label}`,
        disabled: !canDown,
        dataset: { fk: `${fk}-minus` },
        onClick: () => onStep(-1),
      },
      '−',
    ),
    h('output', { 'aria-live': 'polite' }, value),
    h(
      'button',
      {
        type: 'button',
        'aria-label': `More ${label}`,
        disabled: !canUp,
        dataset: { fk: `${fk}-plus` },
        onClick: () => onStep(1),
      },
      '+',
    ),
  );
}

/** Timer button (tap to pause / resume). The shown time is refreshed every second by the ticker. */
function timerButton(timer = null, onToggle, { large = false } = {}) {
  const tm = timer || { running: false, startedAt: null, elapsedMs: 0 };
  startTimerTicker();
  return h(
    'button',
    {
      type: 'button',
      class: ['timer-btn', large && 'timer-btn-lg', !tm.running && 'is-paused'],
      'aria-label': tm.running ? 'Pause the session timer' : 'Resume the session timer',
      dataset: { fk: 'timer' },
      onClick: onToggle,
    },
    tm.running ? icons.pause() : icons.play(),
    h(
      'span',
      { class: 'timer-value', dataset: { elapsed: String(tm.elapsedMs || 0), started: tm.running ? tm.startedAt : '' } },
      L.formatClock(L.timerElapsed(tm)),
    ),
  );
}

/** One ticker for the whole app: refreshes every visible session timer once a second. */
let ticker = null;
export function startTimerTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    for (const el of document.querySelectorAll('.timer-value')) {
      const started = el.dataset.started;
      const timer = { running: !!started, startedAt: started || null, elapsedMs: Number(el.dataset.elapsed) || 0 };
      el.textContent = L.formatClock(L.timerElapsed(timer));
    }
  }, 1000);
}

// ---------------------------------------------------------------- active session

function renderActive(ctx, session) {
  const { cursor } = session;
  const current = L.shownEnd(session); // the end on screen (the current one or a saved one)
  const viewing = session.view != null;
  const editing = L.isEditing(session);
  const enter = (v, x, y, spot) => update(ctx, (cur) => L.enterScore(cur, v, x, y, spot));

  const endNo = L.viewIndex(session) + 1;
  const totalEnds = session.ends.length + 1;
  const sight = findSightMark(ctx.repo, session.distance);

  // --- slots
  const slots = h(
    'div',
    {
      class: ['slots', current.arrows.length > 6 && 'slots-2col'],
      role: 'group',
      'aria-label': 'Arrows in this end',
    },
    current.arrows.map((a, i) => {
      const active = i === cursor;
      return h(
        'button',
        {
          type: 'button',
          class: ['slot', active && 'is-active', active && editing && 'is-moving'],
          'aria-label': `Arrow ${i + 1}${a.v == null ? ', empty' : `, ${a.v}`}${a.m ? `, M${a.m}` : ''}${a.s ? `, S${a.s}` : ''}${active ? ', selected' : ''}`,
          dataset: { fk: `slot-${i}` },
          'aria-pressed': String(active && editing),
          onClick: () => update(ctx, (cur) => L.selectArrow(cur, i)),
        },
        h('span', { class: `score-chip z-${zoneOf(a.v)}` }, a.v == null ? String(i + 1) : String(a.v)),
        // M and S as small badges in the grade colours — as visible as the score
        h(
          'span',
          { class: 'slot-grades', 'aria-hidden': 'true' },
          h('span', { class: `mini-grade ${a.m ? `g${a.m}` : 'empty'}` }, `M${a.m ?? ''}`),
          h('span', { class: `mini-grade ${a.s ? `g${a.s}` : 'empty'}` }, `S${a.s ?? ''}`),
        ),
      );
    }),
  );

  // Clear: shown when an arrow was tapped on the left and has a score or grades; empties that arrow
  const picked = session.pinned ? L.shownEnd(session).arrows[session.cursor] : null;
  const clearable = !!picked && (picked.v != null || picked.m != null || picked.s != null);
  const input = targetInput(session, enter, slots, {
    onMove: (i, v, x, y, spot) => update(ctx, (cur) => L.moveArrow(cur, i, v, x, y, spot)),
    clearable,
    clearLabel: `Clear arrow ${session.cursor + 1}`,
    onClear: () => update(ctx, L.clearArrow),
  });

  // session timer: tap to pause / resume
  // sessions started before the timer existed show it stopped at 0:00; one tap starts it
  const timerBtn = timerButton(session.timer, () =>
    update(ctx, (c) => (c.timer?.running ? L.pauseTimer(c) : L.resumeTimer(c))),
  );

  // Tapping an arrow on the left selects it: the next target touch / key replaces it, grades below apply to it;
  // tapping it again deselects it.
  const grades = gradePanel(session, { onGrade: (kind, g) => update(ctx, (c) => L.gradeArrow(c, kind, g)) });

  const endCard = card(
    { class: 'card-bleed', 'aria-label': `End ${endNo}` },
    h(
      'div',
      { class: 'end-head' },
      // only the end's name up here; Previous / Next end are under the grades
      h(
        'div',
        { class: 'end-nav' },
        h(
          'h2',
          { class: 'end-title' },
          `${T.end} ${endNo}`,
          h('span', { class: 'end-of muted' }, totalEnds > 1 ? ` / ${totalEnds}` : ''),
        ),
      ),
      h('div', { class: 'end-totals' }, photoButton(ctx, session), timerBtn),
    ),
    input,
    grades,
    // Previous end (disabled on the first end) and Next end: on the newest end Next saves it and
    // starts a new one (it needs at least one arrow); on an earlier end it moves one end forward
    h(
      'div',
      { class: 'end-step' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-outline end-step-btn',
          disabled: !L.canPrevEnd(session),
          dataset: { fk: 'end-prev' },
          onClick: () => update(ctx, L.prevEnd),
        },
        icons.back(),
        T.prevEnd,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary end-step-btn',
          'aria-label': viewing ? T.nextEnd : `${T.nextEnd} (saves end ${endNo})`,
          disabled: !L.canNextEnd(session),
          dataset: { fk: 'end-next' },
          onClick: () => update(ctx, L.nextEnd),
        },
        T.nextEnd,
        icons.forward(),
      ),
    ),
  );

  // --- end details
  const stepper = (key, label) =>
    h(
      'div',
      { class: 'field' },
      h('div', { class: 'field-label', id: `lbl-${key}` }, label),
      h(
        'div',
        { class: 'stepper', role: 'group', 'aria-labelledby': `lbl-${key}` },
        h(
          'button',
          {
            type: 'button',
            'aria-label': `Fewer ${label.toLowerCase()}`,
            dataset: { fk: `${key}-minus` },
            onClick: () => update(ctx, (c) => L.bump(c, key, -1)),
          },
          '−',
        ),
        h('output', { 'aria-live': 'polite' }, String(current[key])),
        h(
          'button',
          {
            type: 'button',
            'aria-label': `More ${label.toLowerCase()}`,
            dataset: { fk: `${key}-plus` },
            onClick: () => update(ctx, (c) => L.bump(c, key, 1)),
          },
          '+',
        ),
      ),
    );

  const canFinish = L.canFinish(session);
  // Finish asks OK / Cancel first; the timer is paused meanwhile and runs on if it is cancelled
  const finish = async () => {
    const before = findActive(ctx.repo);
    if (!before || !L.canFinish(before)) return;
    const wasRunning = !!before.timer?.running;
    if (wasRunning) update(ctx, (c) => L.pauseTimer(c));
    // the end being shot is saved too when it has arrows (finishSession keeps it)
    const n = before.ends.length + (L.hasUnsavedArrows(before) ? 1 : 0);
    const ok = await confirmDialog({
      title: 'Finish session?',
      message: `${TYPE_LABELS[sessionType(before)]} · ${n} ${n === 1 ? 'end' : 'ends'}. The session opens in History.`,
      confirmLabel: 'OK',
      icon: 'check',
    });
    const cur = findActive(ctx.repo);
    if (!ok) {
      if (wasRunning && cur && !cur.timer?.running) update(ctx, (c) => L.resumeTimer(c));
      return;
    }
    if (!cur || !L.canFinish(cur)) return;
    const done = L.finishSession(cur);
    if (ctx.save('sessions', done)) {
      ctx.sync?.now(); // put the finished session in Drive right away (no-op when sync is off)
      ctx.navigate(`history/${done.id}`, { replace: true });
    }
  };
  const discard = async () => {
    const ok = await confirmDialog({ title: 'Discard session?', message: T.confirmDiscard, confirmLabel: 'Discard', danger: true });
    if (!ok) return;
    ctx.remove('sessions', session.id);
    ctx.navigate('home', { replace: true });
  };

  const details = card(
    null,
    h('div', { class: 'grid-2' }, stepper('ld', T.letDowns), stepper('cld', T.correctLetDowns)),
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, T.noteForEnd),
      h('textarea', {
        rows: 2,
        placeholder: T.notePh,
        value: current.note,
        dataset: { fk: 'note' },
        onInput: (e) => update(ctx, (c) => L.setNote(c, e.target.value), { rerender: false }),
      }),
    ),
    h(
      'div',
      { class: 'row' },
      // looking at an earlier end: jump straight back to the one being shot
      viewing
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-outline grow-2',
              dataset: { fk: 'back-current' },
              onClick: () => update(ctx, (c) => L.goToEnd(c, null)),
            },
            T.backToEnd(totalEnds),
          )
        : null,
      h(
        'button',
        { type: 'button', class: 'btn btn-outline grow-1', disabled: !canFinish, onClick: finish },
        T.finish,
      ),
    ),
  );

  // --- saved ends (newest first)
  let run = 0;
  const rows = session.ends.map((e, i) => {
    const sc = sumArrows(e.arrows);
    run += sc;
    const st = computeStats([e]);
    return h(
      'li',
      null,
      h(
        'button',
        {
          type: 'button',
          class: ['saved-end', session.view === i && 'is-viewed'],
          'aria-label': `Open end ${i + 1}`,
          'aria-current': session.view === i ? 'true' : null,
          onClick: () => update(ctx, (c) => L.goToEnd(c, i)),
        },
        h('span', { class: 'saved-end-no' }, `E${i + 1}`),
        h(
          'div',
          { class: 'saved-end-body' },
          h(
            'div',
            { class: 'saved-end-arrows' },
            e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join('  '),
          ),
          h('div', { class: 'muted small' }, `M ${fmt(st.avgM)} · S ${fmt(st.avgS)} · LD ${e.cld}/${e.ld}`),
        ),
        h(
          'div',
          { class: 'saved-end-score' },
          h('strong', null, String(sc)),
          h('span', { class: 'muted xsmall' }, `Σ ${run}`),
        ),
      ),
    );
  });

  // Distance, face and arrows/end are already in the header subtitle; only the sight mark is shown here.
  const pills =
    sight && (sight.elevation || sight.windage)
      ? h(
          'div',
          { class: 'pills' },
          h(
            'span',
            { class: 'pill pill-accent' },
            `Sight ${[sight.elevation, sight.windage].filter(Boolean).join(' / ')}`,
          ),
        )
      : null;

  return {
    content: h(
      'div',
      { class: 'stack' },
      pills,
      endCard,
      details,
      rows.length
        ? card(
            { class: 'card-list', 'aria-label': 'Saved ends' },
            h('ol', { class: 'saved-ends', reversed: true }, rows.reverse()),
          )
        : null,
      gearCard(ctx, session),
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: discard }, T.discardSession),
    ),
  };
}

// ---------------------------------------------------------------- arrows from a photo

const PHOTO_MAX = 640; // the photo is scaled down to this many pixels on its long side before detection

/**
 * Camera button: scan the target with the live camera (or take / pick a photo from there); arrows
 * found fill the empty slots of the end after a preview. Best effort: wrong ones are dragged on
 * the face afterwards. Pictures are only used in memory and are never stored.
 */
function photoButton(ctx, session) {
  return h(
    'span',
    { class: 'photo-btn-wrap' },
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Score arrows with the camera',
        dataset: { fk: 'photo' },
        disabled: L.viewIndex(session) !== session.ends.length,
        onClick: () => scoreLive(ctx),
      },
      icons.camera(),
    ),
  );
}

/** What a scan needs from the running session, or null (with a message) when the end is full. */
function scanContext(ctx) {
  const session = findActive(ctx.repo);
  if (!session) return null;
  const face = session.face;
  const empty = L.shownEnd(session).arrows.filter((a) => a.v == null).length;
  if (!empty) {
    ctx.toast('This end is full. Clear an arrow or go to the next end first.');
    return null;
  }
  // A picture of a three-spot sheet may show only one spot (a close-up): its arrows then go on the
  // first spot of the sheet that has no arrow yet in this end.
  const used = new Set(L.shownEnd(session).arrows.filter((a) => a.v != null && a.spot != null).map((a) => a.spot));
  const spotHint = Math.max(0, spotCentres(face).findIndex((_, k) => !used.has(k)));
  return { face, empty, spotHint };
}

/** Live camera: the result locks by itself (or Take now); Cancel in the preview goes back to the camera. */
async function scoreLive(ctx) {
  for (;;) {
    const sc = scanContext(ctx);
    if (!sc) return;
    const got = await liveScan({ face: sc.face, maxArrows: sc.empty, spotHint: sc.spotHint });
    if (!got) return;
    if (got.file) {
      await scoreFromPhoto(ctx, got.file);
      return;
    }
    const shown = cropToSpots(got.canvas, got.res);
    if (await previewAndApply(ctx, shown.canvas, shown.res, sc, { cancelLabel: 'Back to camera' })) return;
  }
}

/**
 * The preview of a live frame shows just the sheet: the picture cut to the box around the spots
 * (the camera frame is mostly background), with the result's picture coordinates moved to match.
 */
function cropToSpots(source, res) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of res.spots) {
    const rad = Math.max(s.outer.rx, s.outer.ry) * 1.25;
    x0 = Math.min(x0, s.outer.cx - rad);
    y0 = Math.min(y0, s.outer.cy - rad);
    x1 = Math.max(x1, s.outer.cx + rad);
    y1 = Math.max(y1, s.outer.cy + rad);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(source.width, Math.ceil(x1));
  y1 = Math.min(source.height, Math.ceil(y1));
  const w = Math.max(1, x1 - x0);
  const hgt = Math.max(1, y1 - y0);
  const k = Math.min(3, PHOTO_MAX / Math.max(w, hgt));
  const canvas = h('canvas', { class: 'photo-preview' });
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(hgt * k);
  canvas.getContext('2d').drawImage(source, x0, y0, w, hgt, 0, 0, canvas.width, canvas.height);
  return {
    canvas,
    res: {
      ...res,
      spots: res.spots.map((s) => ({ outer: { ...s.outer, cx: (s.outer.cx - x0) * k, cy: (s.outer.cy - y0) * k, rx: s.outer.rx * k, ry: s.outer.ry * k } })),
      arrows: res.arrows.map((a) => ({ ...a, image: { x: (a.image.x - x0) * k, y: (a.image.y - y0) * k } })),
    },
  };
}

async function scoreFromPhoto(ctx, file) {
  const sc = scanContext(ctx);
  if (!sc) return;
  const { face, empty, spotHint } = sc;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    ctx.toast('Could not open the photo.');
    return;
  }
  const k = Math.min(1, PHOTO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = h('canvas', { class: 'photo-preview' });
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let res = detectArrows(g.getImageData(0, 0, canvas.width, canvas.height), face, empty, { spotHint });
  if (res.error) {
    bitmap.close();
    ctx.toast(res.error);
    return;
  }
  // Second look, at just the sheet: the box around the spots is taken from the full-size photo, so
  // the same number of analysed pixels shows the target in much more detail. Kept when it finds
  // the face again.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of res.spots) {
    const rad = (Math.max(s.outer.rx, s.outer.ry) * 1.3) / k;
    x0 = Math.min(x0, s.outer.cx / k - rad);
    y0 = Math.min(y0, s.outer.cy / k - rad);
    x1 = Math.max(x1, s.outer.cx / k + rad);
    y1 = Math.max(y1, s.outer.cy / k + rad);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(bitmap.width, Math.ceil(x1));
  y1 = Math.min(bitmap.height, Math.ceil(y1));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw > 16 && bh > 16 && bw * bh < 0.8 * bitmap.width * bitmap.height) {
    const k2 = Math.min(1, PHOTO_MAX / Math.max(bw, bh));
    const close = document.createElement('canvas');
    close.width = Math.round(bw * k2);
    close.height = Math.round(bh * k2);
    const g2 = close.getContext('2d', { willReadFrequently: true });
    g2.drawImage(bitmap, x0, y0, bw, bh, 0, 0, close.width, close.height);
    const res2 = detectArrows(g2.getImageData(0, 0, close.width, close.height), face, empty, { spotHint });
    if (!res2.error && res2.spots.length >= res.spots.length) {
      canvas.width = close.width;
      canvas.height = close.height;
      canvas.getContext('2d').drawImage(close, 0, 0);
      res = res2;
    }
  }
  bitmap.close();
  await previewAndApply(ctx, canvas, res, sc);
}

/**
 * Show the picture with what was found (the face edge, each arrow numbered with its score) and, on
 * Use, enter the arrows into the end. Returns true when the question is settled (used, or nothing
 * to use), false when it was cancelled.
 */
async function previewAndApply(ctx, canvas, res, { face }, { cancelLabel = 'Cancel' } = {}) {
  const g = canvas.getContext('2d');
  // the clean photo is kept, so the marks can be drawn again when a label is dragged
  const photo = document.createElement('canvas');
  photo.width = canvas.width;
  photo.height = canvas.height;
  photo.getContext('2d').drawImage(canvas, 0, 0);
  // the arrows as they will be used: dragging a label changes them
  const arrows = res.arrows.map((a) => ({ ...a, image: { ...a.image } }));
  let values = arrows.map((a) => scoreFromPoint(a.x, a.y, face));
  let dragging = -1;
  const redraw = () => {
    g.drawImage(photo, 0, 0);
    g.lineWidth = Math.max(2, canvas.width / 220);
    g.strokeStyle = '#00e5ff';
    for (const s of res.spots) {
      g.beginPath();
      g.ellipse(s.outer.cx, s.outer.cy, s.outer.rx, s.outer.ry, s.outer.angle, 0, Math.PI * 2);
      g.stroke();
    }
    drawArrowMarks(g, res.spots, arrows, values, { active: dragging, long: true });
  };
  redraw();

  // --- dragging a score label moves its arrow: the line's end is the point of impact, the label
  // keeps its distance to it, and the score in the label follows the rings under the point
  // a point of the picture → the face (relative to a spot's centre, spot radius 1)
  const onFace = (o, p) => {
    const cos = Math.cos(o.angle);
    const sin = Math.sin(o.angle);
    const vx = p.x - o.cx;
    const vy = p.y - o.cy;
    const u1 = (cos * vx + sin * vy) / o.rx;
    const u2 = (-sin * vx + cos * vy) / o.ry;
    return { x: cos * u1 - sin * u2, y: sin * u1 + cos * u2 };
  };
  const place = (a, p) => {
    a.image = { x: Math.max(0, Math.min(canvas.width, p.x)), y: Math.max(0, Math.min(canvas.height, p.y)) };
    // on a sheet of several spots (all in the picture) the arrow belongs to the spot it is nearest to
    const single = res.partial || !isMultiSpot(face);
    let at = single ? onFace(res.spots[0].outer, a.image) : null;
    if (!single) {
      res.spots.forEach((s, j) => {
        const f = onFace(s.outer, a.image);
        if (!at || Math.hypot(f.x, f.y) < Math.hypot(at.x, at.y)) {
          at = f;
          a.spot = j;
        }
      });
    }
    a.x = at.x;
    a.y = at.y;
  };
  const pictureXY = (ev) => {
    const r = canvas.getBoundingClientRect();
    // the canvas is shown with object-fit: contain, so it may be letterboxed inside its box
    const k = Math.max(canvas.width / r.width, canvas.height / r.height);
    return {
      x: (ev.clientX - (r.left + r.width / 2)) * k + canvas.width / 2,
      y: (ev.clientY - (r.top + r.height / 2)) * k + canvas.height / 2,
      k,
    };
  };
  let grab = null; // { id, i, off } while a label is held
  canvas.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ev.button > 0 || grab) return;
    const p = pictureXY(ev);
    // the nearest label (or its point of impact) within about a fingertip
    let best = null;
    arrows.forEach((a, i) => {
      const m = arrowMarkLayout(canvas.width, canvas.height, res.spots, a, { long: true });
      const d = Math.min(Math.hypot(m.lx - p.x, m.ly - p.y) - m.r, Math.hypot(a.image.x - p.x, a.image.y - p.y));
      if (d <= 26 * p.k && (!best || d < best.d)) best = { i, d };
    });
    if (!best) return;
    ev.preventDefault();
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* pointer already gone */
    }
    const a = arrows[best.i];
    grab = { id: ev.pointerId, i: best.i, off: { x: a.image.x - p.x, y: a.image.y - p.y } };
    dragging = best.i;
    if (navigator.vibrate) navigator.vibrate(15);
    redraw();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!grab || ev.pointerId !== grab.id) return;
    const p = pictureXY(ev);
    place(arrows[grab.i], { x: p.x + grab.off.x, y: p.y + grab.off.y });
    values = arrows.map((a) => scoreFromPoint(a.x, a.y, face));
    redraw();
  });
  const drop = (ev) => {
    if (!grab || ev.pointerId !== grab.id) return;
    grab = null;
    dragging = -1;
    redraw();
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.classList.add('is-adjustable');

  const n = res.arrows.length;
  // Just the picture with the found arrows and the two buttons. Only when nothing was found does
  // the dialog say so (a picture without marks would explain nothing).
  const ok = await confirmDialog(
    n
      ? { title: `Found arrows: ${values.join(', ')}`, bare: true, confirmLabel: 'Use', cancelLabel, body: canvas }
      : {
          title: 'No arrows found',
          message: 'Try a photo taken straight at the target, close enough that the face fills the picture.',
          confirmLabel: 'OK',
          cancelLabel,
          icon: 'camera',
          body: canvas,
        },
  );
  if (!ok) return false;
  if (!n) return true;
  update(ctx, (cur) =>
    arrows.reduce((s, a, i) => {
      const inside = Math.hypot(a.x, a.y) < 1.05;
      return L.enterScore(s, values[i], inside ? round3(a.x) : null, inside ? round3(a.y) : null, a.spot);
    }, { ...cur, pinned: false }),
  );
  return true;
}

function findSightMark(repo, distance) {
  return repo.list('sightMarks').find((m) => parseInt(m.distance, 10) === distance) || null;
}

// ---------------------------------------------------------------- target face

const LOUPE_SPAN = 24; // viewBox units shown in the magnifier (the face is 202 wide → ~3× zoom)
// The spot an arrow was just placed on (multi-spot sheets): placing re-renders the page, and the new
// target starts zoomed on this spot and animates out to the whole sheet (the reverse of the zoom in).
let zoomOutFrom = null;

function arrowDots(session) {
  const at = (a) => sheetPoint(a, session.face);
  const prev = L.otherEnds(session)
    .flatMap((e) => e.arrows)
    .filter((a) => a.x != null);
  const cur = L.shownEnd(session)
    .arrows.map((a, i) => ({ a, i }))
    .filter(({ a }) => a.x != null);
  const movingIdx = L.isEditing(session) ? session.cursor : -1;
  return [
    ...prev.map((a) =>
      s('circle', {
        cx: at(a).x,
        cy: at(a).y,
        r: 3.2,
        fill: 'rgba(20,24,28,0.6)',
        stroke: '#FFFFFF',
        'stroke-width': 1.2,
      }),
    ),
    ...cur.map(({ a, i }) =>
      s(
        'g',
        { transform: `translate(${at(a).x} ${at(a).y})`, opacity: i === movingIdx ? 0.55 : null, 'data-arrow': i },
        // the arrow being moved gets a dashed ring so you can see which one will change
        i === movingIdx
          ? s('circle', {
              r: 10,
              fill: 'none',
              stroke: '#E5007E',
              'stroke-width': 1.4,
              'stroke-dasharray': '2.5 2',
            })
          : null,
        s('circle', { r: 6.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.3 }),
        s(
          'text',
          { y: 2.3, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#FFFFFF' },
          String(i + 1),
        ),
      ),
    ),
  ];
}

/**
 * Target face input. Touch (or press) shows a magnifier with the exact hit point and its score;
 * moving the finger fine-tunes the position; releasing registers the arrow. Cancel = no arrow.
 * Multi-spot sheets (triple, Vegas): the first tap zooms into the spot tapped, so it fills the
 * target area; the arrow is then placed on it the same way, and the view zooms back out.
 * The magnifier's place is chosen when the finger lands and stays there until it lifts.
 */
function targetInput(session, enter, slots, { clearable = false, clearLabel = 'Clear arrow', onClear, onMove } = {}) {
  const selectedValue = L.shownEnd(session).arrows[session.cursor]?.v ?? null;
  // magnifier: zoomed copy of the face centred on the finger, with a crosshair and the live score
  const marker = s(
    'g',
    null,
    s('circle', { r: 1.1, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 0.4 }),
    s('path', {
      d: 'M-4 0h2.4M1.6 0h2.4M0 -4v2.4M0 1.6v2.4',
      stroke: '#E5007E',
      'stroke-width': 0.45,
      'stroke-linecap': 'round',
    }),
  );
  const loupeSvg = s(
    'svg',
    { 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
    marker,
  );
  const loupeScore = h('span', { class: 'score-chip loupe-score' });
  // shown while a placed arrow is dragged: which arrow moves, and the score it had
  const loupeTag = h('span', { class: 'loupe-tag', hidden: true });
  const loupe = h('div', { class: 'loupe', 'aria-hidden': 'true', hidden: true }, loupeSvg, loupeTag, loupeScore);
  // on the sheet, a move looks different from a new arrow: the arrow's own numbered dot travels with
  // the finger, tied to the place it came from by a dashed line
  const guideLine = s('line', { stroke: '#E5007E', 'stroke-width': 1.6, 'stroke-dasharray': '3.5 2.5', 'stroke-linecap': 'round' });
  const guideFrom = s('circle', { r: 9.5, fill: 'none', stroke: '#E5007E', 'stroke-width': 1.4, 'stroke-dasharray': '2.5 2' });
  const guideNumber = s('text', { y: 2.6, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, fill: '#FFFFFF' });
  const guideDot = s(
    'g',
    null,
    s('circle', { r: 11, fill: 'rgba(229, 0, 126, 0.25)' }),
    s('circle', { r: 7.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.5 }),
    guideNumber,
  );
  const moveGuide = s('g', { class: 'move-guide', visibility: 'hidden' }, guideLine, guideFrom, guideDot);

  let active = null; // { id, p, mode } with p in sheet coordinates (one spot's radius = 1)
  const multi = isMultiSpot(session.face);
  let zoomed = null; // index of the spot zoomed into (multi-spot sheets), or null
  const sheet = s(
    'svg',
    { viewBox: faceViewBox(session.face), 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
    moveGuide,
  );
  const btn = h(
    'button',
    {
      type: 'button',
      class: ['target-btn', multi && 'target-sheet'],
      'aria-label': multi
        ? 'Target sheet: tap a spot to zoom in, then touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)'
        : 'Target face: touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)',
    },
    sheet,
  );

  // --- zoom (multi-spot sheets): animate the sheet's viewBox between the whole sheet and one spot
  const fullBox = faceViewBox(session.face).split(' ').map(Number);
  const spotBox = (i) => {
    const [cx, cy] = spotCentres(session.face)[i];
    return [cx - VB, cy - VB, VB * 2, VB * 2];
  };
  let anim = 0;
  const setBox = (to) => {
    cancelAnimationFrame(anim);
    const from = sheet.getAttribute('viewBox').split(' ').map(Number);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sheet.setAttribute('viewBox', to.join(' '));
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 200);
      const e = 1 - (1 - k) ** 3; // ease-out
      sheet.setAttribute('viewBox', from.map((f, j) => f + (to[j] - f) * e).join(' '));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const zoomOutBtn = h(
    'button',
    { type: 'button', class: 'zoom-out-btn', hidden: true, 'aria-label': 'Show all spots', onClick: () => zoomTo(null) },
    icons.back(),
    'All spots',
  );
  if (multi && zoomOutFrom != null) {
    sheet.setAttribute('viewBox', spotBox(zoomOutFrom).join(' '));
    zoomOutFrom = null;
    requestAnimationFrame(() => setBox(fullBox));
  }
  function zoomTo(i) {
    zoomed = i;
    setBox(i == null ? fullBox : spotBox(i));
    btn.classList.toggle('is-zoomed', i != null);
    zoomOutBtn.hidden = i == null;
  }

  const toFace = (ev) => {
    const r = btn.getBoundingClientRect();
    // screen → SVG units (the sheet may be letterboxed inside the square button)
    const m = sheet.getScreenCTM()?.inverse();
    const pt = m ? new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m) : { x: 0, y: 0 };
    return {
      x: pt.x / 100,
      y: pt.y / 100,
      // finger position inside the stage, used to keep the loupe out from under the finger
      px: ev.clientX - r.left,
      py: ev.clientY - r.top,
    };
  };

  // The loupe's place is chosen once, when the finger lands, and kept until it lifts (it never jumps).
  // Above the target face when there is room; otherwise over the face, centred, on the half away
  // from the finger (finger on the top half: loupe at the bottom, and the other way round).
  const visibleTop = () => {
    const header = document.querySelector('.app-header');
    if (header && !header.hidden) return header.getBoundingClientRect().bottom;
    return document.querySelector('.main')?.getBoundingClientRect().top ?? 0;
  };
  const placeLoupe = (p) => {
    const size = loupe.offsetWidth || 132;
    const gap = 10;
    const stage = btn.getBoundingClientRect();
    const left = stage.left + stage.width / 2 - size / 2;
    let top = stage.top - size - gap;
    if (top < visibleTop() + gap) {
      top = p.py < stage.height / 2 ? stage.bottom - size - gap : Math.max(visibleTop() + gap, stage.top + gap);
    }
    loupe.style.top = `${Math.round(top)}px`;
    loupe.style.left = `${Math.round(left)}px`;
  };

  const show = (p) => {
    const cx = p.x * 100;
    const cy = p.y * 100;
    loupeSvg.setAttribute(
      'viewBox',
      `${cx - LOUPE_SPAN / 2} ${cy - LOUPE_SPAN / 2} ${LOUPE_SPAN} ${LOUPE_SPAN}`,
    );
    marker.setAttribute('transform', `translate(${cx} ${cy})`);
    const hit = locateOnSheet(p.x, p.y, session.face);
    const v = scoreFromPoint(hit.x, hit.y, session.face);
    loupeScore.textContent = String(v);
    loupeScore.className = `score-chip loupe-score z-${zoneOf(v)}`;
    loupe.hidden = false;
    if (active?.mode === 'move') {
      const from = active.origin;
      guideLine.setAttribute('x1', from.x * 100);
      guideLine.setAttribute('y1', from.y * 100);
      guideLine.setAttribute('x2', cx);
      guideLine.setAttribute('y2', cy);
      guideFrom.setAttribute('cx', from.x * 100);
      guideFrom.setAttribute('cy', from.y * 100);
      guideDot.setAttribute('transform', `translate(${cx} ${cy})`);
    }
  };

  // the aimed point: the finger's, shifted by the grab offset (finger px / py stay the finger's)
  const aimFrom = (f, off) => ({ ...f, x: f.x + off.x, y: f.y + off.y });
  // the placed arrow of the shown end nearest the pointer, within `reachPx` on the screen
  const grabAt = (f, reachPx) => {
    const vb = sheet.getAttribute('viewBox').split(' ').map(Number);
    const r = btn.getBoundingClientRect();
    const unitsPerPx = Math.max(vb[2] / r.width, vb[3] / r.height); // the sheet is letterboxed (meet)
    const reach = (reachPx * unitsPerPx) / 100;
    let best = null;
    L.shownEnd(session).arrows.forEach((a, i) => {
      if (a.v == null || a.x == null) return;
      const d = sheetPoint(a, session.face);
      const dot = { x: d.x / 100, y: d.y / 100 };
      const dist = Math.hypot(dot.x - f.x, dot.y - f.y);
      if (dist <= reach && (!best || dist < best.dist)) best = { i, dist, off: { x: dot.x - f.x, y: dot.y - f.y } };
    });
    return best;
  };

  const end = (ev, commit) => {
    if (!active || ev.pointerId !== active.id) return;
    const { p, mode, idx, tapPicks, moved } = active;
    active = null;
    loupe.hidden = true;
    loupe.classList.remove('is-moving');
    loupeTag.hidden = true;
    moveGuide.setAttribute('visibility', 'hidden');
    btn.classList.remove('aiming', 'moving');
    sheet.querySelector('.is-grabbed')?.classList.remove('is-grabbed');
    if (!commit) return;
    // a tap on the whole sheet zooms into the spot tapped
    // (also a tap on an arrow there: only a drag moves it)
    if (mode === 'pick' || (tapPicks && moved < 8)) {
      zoomTo(locateOnSheet(p.x, p.y, session.face).spot);
      return;
    }
    if (multi) zoomOutFrom = zoomed;
    const hit = locateOnSheet(p.x, p.y, session.face);
    const keep = Math.hypot(hit.x, hit.y) < 1.05;
    const args = [scoreFromPoint(hit.x, hit.y, session.face), keep ? round3(hit.x) : null, keep ? round3(hit.y) : null, hit.spot];
    // a placed arrow that was dragged moves; otherwise the touch enters a score
    if (mode === 'move') onMove(idx, ...args);
    else enter(...args);
    // nothing was entered (the page did not re-render): zoom out here instead
    if (multi && btn.isConnected) {
      zoomOutFrom = null;
      zoomTo(null);
    }
  };

  btn.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ev.button > 0 || active) return;
    ev.preventDefault();
    try {
      btn.setPointerCapture(ev.pointerId); // keep receiving moves when the finger leaves the face
    } catch {
      /* pointer already gone */
    }
    const p = toFace(ev);
    // Touching a placed arrow of this end grabs it: dragging moves it (the pointer keeps its distance
    // to the dot, so the dot does not jump under the finger). A finger covers the dot and lands
    // less exactly than a mouse, so it reaches further. On a sheet of several spots this works on
    // the whole sheet too, without zooming in first.
    const whole = multi && zoomed == null;
    const grab = onMove ? grabAt(p, ev.pointerType === 'mouse' ? 26 : whole ? 34 : 44) : null;
    // multi-spot sheet not zoomed yet: a touch off the arrows only picks the spot
    if (whole && !grab) {
      active = { id: ev.pointerId, p, mode: 'pick' };
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY, moved: 0 };
    active = grab
      ? { id: ev.pointerId, mode: 'move', idx: grab.i, off: grab.off, p: aimFrom(p, grab.off), origin: aimFrom(p, grab.off), from, moved: 0, tapPicks: whole }
      : { id: ev.pointerId, mode: 'aim', off: { x: 0, y: 0 }, p, from, moved: 0 };
    if (grab) {
      sheet.querySelector(`[data-arrow="${grab.i}"]`)?.classList.add('is-grabbed');
      guideNumber.textContent = String(grab.i + 1);
      moveGuide.setAttribute('visibility', 'visible');
      loupeTag.textContent = `Move ${grab.i + 1} · was ${L.shownEnd(session).arrows[grab.i].v}`;
      loupeTag.hidden = false;
      loupe.classList.add('is-moving');
      btn.classList.add('moving');
      if (navigator.vibrate) navigator.vibrate(15);
    }
    btn.classList.add('aiming');
    show(active.p);
    placeLoupe(active.p);
  });
  btn.addEventListener('pointermove', (ev) => {
    if (!active || ev.pointerId !== active.id) return;
    if (active.mode === 'pick') {
      active.p = toFace(ev);
      return;
    }
    active.moved = Math.max(active.moved, Math.hypot(ev.clientX - active.from.x, ev.clientY - active.from.y));
    active.p = aimFrom(toFace(ev), active.off);
    show(active.p);
  });
  btn.addEventListener('pointerup', (ev) => end(ev, true));
  btn.addEventListener('pointercancel', (ev) => end(ev, false));
  btn.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return h(
    'div',
    { class: 'target-wrap' },
    // arrow slots in a column on the left, target face on the right
    h(
      'div',
      { class: ['aim-row', session.arrowsPerEnd > 6 && 'aim-row-wide'] },
      slots,
      h('div', { class: 'target-stage' }, btn, multi ? zoomOutBtn : null, loupe),
    ),
    h(
      'div',
      { class: 'quick-keys', role: 'group', 'aria-label': 'Quick score without position' },
      ['X', 10, 9, 8, 7, 6, 'M'].map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: `quick-key z-${zoneOf(k)}`,
            'aria-label': `Score ${k === 'M' ? 'miss' : k}`,
            // the selected arrow's score is shown pressed; the other keys dim (like the grade rows)
            'aria-pressed': String(selectedValue === k),
            dataset: { fk: `quick-${k}` },
            onClick: () => enter(k, null, null),
          },
          String(k),
        ),
      ),
      // at the thumb's end of the row; its place is kept (invisible) when no arrow is picked
      h(
        'button',
        {
          type: 'button',
          class: ['quick-key', 'clear-key', !clearable && 'is-off'],
          'aria-label': clearLabel,
          'aria-hidden': clearable ? null : 'true',
          tabindex: clearable ? null : '-1',
          disabled: !clearable,
          dataset: { fk: 'clear-arrow' },
          onClick: () => onClear?.(),
        },
        icons.erase(),
      ),
    ),
  );
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- inline grades

/** Two compact rows (M and S, grades 1–5) for the selected arrow, styled like the score keys. */
function gradePanel(session, { onGrade }) {
  const a = L.shownEnd(session).arrows[session.cursor];
  const row = (kind, label, full) =>
    h(
      'div',
      { class: 'grade-line', role: 'group', 'aria-label': `${full} for arrow ${session.cursor + 1}` },
      h('span', { class: 'grade-line-label', 'aria-hidden': 'true' }, label),
      [1, 2, 3, 4, 5].map((g) =>
        h(
          'button',
          {
            type: 'button',
            class: `grade-key g${g}`,
            'aria-pressed': String(a[kind] === g),
            'aria-label': `${full} ${g}`,
            dataset: { fk: `grade-${kind}-${g}` },
            onClick: () => onGrade(kind, g),
          },
          String(g),
        ),
      ),
    );
  return h('div', { class: 'grade-panel' }, row('m', 'M', T.mentalProgram), row('s', 'S', T.shootingCycle));
}

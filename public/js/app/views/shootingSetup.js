// New session, step 1 (what you do) and the Shooting page: training, competition and blank bale
// behind one switch. Every field starts from the last session of the kind shown (lastSetup.js);
// nothing starts until Start is tapped.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { lastSetupOf, rememberSetup, SHOOTING_KINDS, ARROW_GOALS } from '../lastSetup.js';
import { DISTANCES, DISTANCE_DEFAULTS, SETUP_FACES, ARROWS_PER_END_MIN, ARROWS_PER_END_MAX } from '../scoring.js';
import {
  TYPE_LABELS,
  setupSummary,
  emptyCompetition,
  ROUNDS,
  CONDITIONS,
  parseConditions,
  joinConditions,
  toggleCondition,
} from '../sessionTypes.js';
import { setupState, whenSection, equipmentSection } from './sessionSetup.js';
import { emptyForm, formSections } from './sessionForms.js';
import { faceParts, faceId, FACE_SIZES, kindsForSize, faceForSize } from './setupFaces.js';

const ARROW_PRESETS = [3, 6, 9, 12];
const arrowsText = (n) => `${n} ${n === 1 ? 'arrow' : 'arrows'}/end`;

export const KIND_LABELS = { training: 'Training', competition: 'Competition', blank: 'Blank bale' };
const START_LABELS = { training: 'Start training', competition: 'Start competition', blank: 'Start blank bale' };

// ---------------------------------------------------------------- step 1

/**
 * A card of step 1: an icon well, the title and its line, a chevron; `extra` below. `big`: the
 * highlighted card; `choice`: a card of a choice page (big text on the plain surface), `accent` its
 * well in the accent colours.
 */
function typeCard({ href, icon, title, detail, fk, extra = null, big = false, choice = false, accent = false }) {
  return h(
    'a',
    { href, class: ['ns-type', big && 'ns-type--big', choice && 'ns-type--choice'], dataset: { fk } },
    h(
      'span',
      { class: 'ns-type-row' },
      h('span', { class: ['ns-type-well', accent && 'ns-type-well--accent'], 'aria-hidden': 'true' }, icon),
      h(
        'span',
        { class: 'ns-type-text' },
        h('span', { class: 'ns-type-title' }, title),
        h('span', { class: 'ns-type-detail' }, detail),
      ),
      h('span', { class: 'ns-type-go', 'aria-hidden': 'true' }, icons.chevron()),
    ),
    extra,
  );
}

/**
 * Strength (#/new/strength-choice): SPT (its own page, #/new/strength) or Gym (#/new/gym). Opening
 * this page starts nothing.
 */
export function renderStrengthChoice(ctx) {
  const tags = (list) => h('span', { class: 'ns-type-tags' }, list.map((t) => h('span', { class: 'ns-type-tag' }, t)));
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Strength', onBack: () => ctx.navigate('new'), backLabel: 'Back to session type' }),
      h(
        'nav',
        { class: 'apl-screen-body ns-types', 'aria-label': 'Strength session' },
        typeCard({
          href: '#/new/strength',
          icon: APL.Icon({ name: 'stopwatch', size: 24 }),
          title: TYPE_LABELS.strength,
          detail: 'Archery-specific strength with the bow',
          fk: 'strength-spt',
          extra: tags(['SPT holds', 'Draws with bow', 'Band draws', 'Interval timer']),
          choice: true,
          accent: true,
        }),
        typeCard({
          href: '#/new/gym',
          icon: icons.dumbbell(24),
          title: TYPE_LABELS.gym,
          detail: 'Exercises, sets and reps — or just a note',
          fk: 'strength-gym',
          extra: tags(['Upper body', 'Core', 'Cardio', 'Mobility']),
          choice: true,
        }),
      ),
    ),
  };
}

/**
 * Step 1: Shooting (training, competition, blank bale on one card), Strength (SPT or gym), Mental
 * and, for a session that is already over, Log afterwards (the manual type).
 */
export function renderTypeChoice(ctx) {
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'New session', onBack: () => ctx.navigate('home'), backLabel: 'Back to dashboard' }),
      h(
        'nav',
        { class: 'apl-screen-body ns-types', 'aria-label': 'Session type' },
        typeCard({
          href: '#/new/shooting/training',
          icon: APL.Icon({ name: 'target', size: 26 }),
          title: 'Shooting',
          detail: 'Arrows at the target or the bale',
          fk: 'type-shooting',
          big: true,
          extra: h(
            'span',
            { class: 'ns-type-tags' },
            SHOOTING_KINDS.map((k) => h('span', { class: 'ns-type-tag' }, KIND_LABELS[k])),
          ),
        }),
        typeCard({
          href: '#/new/strength-choice',
          icon: icons.dumbbell(),
          title: 'Strength',
          detail: 'SPT drills or a gym workout',
          fk: 'type-strength',
        }),
        typeCard({
          href: '#/new/mental',
          icon: icons.mental(),
          title: TYPE_LABELS.mental,
          detail: 'Visualisation, breathing, shot routine',
          fk: 'type-mental',
        }),
        h('div', { class: 'ns-divider' }, h('span', null, 'Already done?')),
        h(
          'a',
          { href: '#/new/manual', class: 'ns-later', dataset: { fk: 'type-manual' } },
          h('span', { class: 'ns-later-icon', 'aria-hidden': 'true' }, icons.pencil()),
          h(
            'span',
            { class: 'ns-type-text' },
            h('span', { class: 'ns-type-title ns-type-title--sm' }, 'Log afterwards'),
            h('span', { class: 'ns-type-detail' }, 'Type in arrows or duration — no timer'),
          ),
        ),
      ),
    ),
  };
}

// ---------------------------------------------------------------- the Shooting page

/** A kind's fields as the last session of that kind left them. */
function fromLast(settings, kind) {
  const last = lastSetupOf(settings, kind);
  if (kind === 'blank') return { goal: last.goal };
  // a face no longer offered (the single 40 cm 10–6 spot) falls back to the triple
  const fields = {
    distance: last.distance,
    face: SETUP_FACES.includes(last.face) ? last.face : '40t',
    arrowsPerEnd: last.arrowsPerEnd,
    grading: last.grading,
  };
  if (kind !== 'competition') return fields;
  // the event is new every time; the round and the conditions are usually the same as last time
  const round = last.round || '';
  return {
    ...fields,
    competition: { event: '', round, conditions: last.conditions || '', otherRound: !!round && !ROUNDS.includes(round) },
  };
}

/** The tabs Training | Competition | Blank bale; switching replaces the page in the history. */
function kindTabs(ctx, kind) {
  const go = (k) => k !== kind && ctx.navigate(`new/shooting/${k}`, { replace: true });
  const onKeydown = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = SHOOTING_KINDS.length;
    const next = SHOOTING_KINDS[(SHOOTING_KINDS.indexOf(kind) + step + n) % n];
    // the new tab takes the focus first, so it keeps it when the page is drawn again
    e.currentTarget.querySelector(`[data-fk="kind-${next}"]`)?.focus();
    go(next);
  };
  return h(
    'div',
    {
      class: 'apl apl-seg ns-kinds',
      role: 'tablist',
      'aria-label': 'Kind of shooting',
      style: { '--apl-cols': String(SHOOTING_KINDS.length) },
      onKeydown,
    },
    SHOOTING_KINDS.map((k) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `kind-${k}`,
          'aria-selected': String(k === kind),
          'aria-controls': 'shooting-panel',
          tabindex: k === kind ? '0' : '-1',
          dataset: { fk: `kind-${k}` },
          onClick: () => go(k),
        },
        KIND_LABELS[k],
      ),
    ),
  );
}

/** Competition: the event, the round (chips or Other) and the conditions (chips, plus older text). */
function competitionSection(fields, { setKind, quietKind }) {
  const comp = fields.competition;
  const setComp = (patch) => setKind({ competition: { ...comp, ...patch } });
  const typed = (patch) => quietKind({ competition: Object.assign(comp, patch) });
  const { chips, rest } = parseConditions(comp.conditions);
  const roundValue = comp.otherRound ? 'Other' : comp.round;
  return APL.Section({
    label: 'Competition',
    id: 'setup-comp',
    children: [
      APL.TextField({
        label: 'Event',
        placeholder: 'e.g. Indoor Cup Bratislava',
        value: comp.event,
        fk: 'comp-event',
        onInput: (e) => typed({ event: e.target.value }),
      }),
      h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Round'),
      APL.OptionPills({
        label: 'Round',
        value: roundValue,
        options: [...ROUNDS, 'Other'].map((r) => ({ value: r, label: r })),
        // tapping the chosen round again clears it
        onChange: (r) => {
          if (r === roundValue) setComp({ round: '', otherRound: false });
          else if (r === 'Other') setComp({ round: '', otherRound: true });
          else setComp({ round: r, otherRound: false });
        },
        fk: 'comp-round',
      }),
      comp.otherRound
        ? APL.TextField({
            label: 'Other round',
            placeholder: 'e.g. Indoor 2 × 30',
            value: comp.round,
            fk: 'comp-round-text',
            onInput: (e) => typed({ round: e.target.value }),
          })
        : null,
      h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Conditions ', h('span', { class: 'ns-sublabel-soft' }, '· pick any')),
      APL.OptionPills({
        label: 'Conditions',
        multiple: true,
        value: chips,
        options: CONDITIONS.map((c) => ({ value: c, label: c })),
        onChange: (c) =>
          setComp({ conditions: toggleCondition(comp.conditions, c) }),
        fk: 'comp-cond',
      }),
      // conditions typed before the chips existed stay editable as text
      rest
        ? APL.TextField({
            label: 'Other conditions',
            value: rest,
            fk: 'comp-cond-text',
            onInput: (e) => typed({ conditions: joinConditions(chips, e.target.value) }),
          })
        : null,
    ],
  });
}

/** Distance, face and arrows per end of a scored kind. */
function scoredSections(fields, setKind) {
  const { size, kind } = faceParts(fields.face) || faceParts('40t');
  const suggested = DISTANCE_DEFAULTS[fields.distance]?.face === fields.face;
  return [
    APL.Section({
      label: T.distance,
      id: 'setup-dist',
      children: APL.ChipGrid({
        label: 'Distance',
        value: fields.distance,
        options: DISTANCES.map((d) => ({ value: d, label: `${d} m` })),
        // picking a distance suggests its usual face
        onChange: (d) => setKind({ distance: d, ...DISTANCE_DEFAULTS[d] }),
        fk: 'dist',
      }),
    }),
    APL.Section({
      label: T.targetFace,
      id: 'setup-face',
      accessory: suggested ? APL.Badge({ children: `Suggested for ${fields.distance} m` }) : null,
      children: [
        APL.FaceCard({ size, kind }),
        APL.SegmentedControl({
          label: 'Face size',
          value: size,
          options: FACE_SIZES.map((v) => ({ value: v, label: `${v} cm` })),
          onChange: (v) => setKind({ face: faceForSize(v, fields.face) }),
          fk: 'face-size',
        }),
        kindsForSize(size).length > 1
          ? APL.OptionPills({
              label: 'Face type',
              value: kind,
              options: kindsForSize(size).map((k) => ({ value: k, label: APL.FACE_NAMES[k] })),
              onChange: (k) => setKind({ face: faceId(size, k) }),
              fk: 'face-kind',
            })
          : null,
      ],
    }),
    APL.Section({
      label: T.arrowsPerEnd,
      id: 'setup-n',
      // the chips hold the usual counts; the stepper reaches the others
      accessory: APL.Stepper({
        label: 'arrows per end',
        value: fields.arrowsPerEnd,
        min: ARROWS_PER_END_MIN,
        max: ARROWS_PER_END_MAX,
        onChange: (n) => setKind({ arrowsPerEnd: n }),
        fk: 'n',
      }),
      children: APL.ChipGrid({
        label: 'Arrows per end',
        numeric: true,
        value: fields.arrowsPerEnd,
        options: ARROW_PRESETS.map((n) => ({ value: n, label: String(n) })),
        onChange: (n) => setKind({ arrowsPerEnd: n }),
        fk: 'n-chip',
      }),
    }),
    APL.Section({
      label: 'Grading',
      id: 'setup-grading',
      children: APL.Switch({
        title: 'Mental grading',
        detail: 'Grade each arrow on the mental program (M) and the shooting cycle (S)',
        checked: fields.grading !== false,
        onChange: (on) => setKind({ grading: on }),
        fk: 'grading',
      }),
    }),
  ];
}

/**
 * Blank bale: what it is, and an optional arrow goal. Logged afterwards (a past start): the count,
 * the duration and a note, typed in here (no running page).
 */
function blankSections(fields, setKind, { past, quietKind }) {
  const form = fields.form || emptyForm('blank');
  // typing stores without re-rendering; taps (+1, −1) re-render
  const change = (update, { rerender = true } = {}) => {
    const next = { ...form, ...update(form) };
    if (rerender) setKind({ form: next });
    else quietKind({ form: Object.assign(form, next) });
  };
  return [
    past ? null : h(
      'div',
      { class: 'ns-info' },
      h('span', { class: 'ns-info-well', 'aria-hidden': 'true' }, APL.Icon({ name: 'plus', size: 20 })),
      h(
        'p',
        null,
        'No score, no face — after you start, count arrows with ',
        h('strong', null, '+1 / +3 / +6'),
        ' while you shoot. The timer runs from Start.',
      ),
    ),
    APL.Section({
      label: 'Arrow goal',
      id: 'setup-goal',
      accessory: h('span', { class: 'apl-cap' }, 'optional'),
      children: APL.ChipGrid({
        label: 'Arrow goal',
        columns: 5,
        value: fields.goal ?? 0,
        options: [{ value: 0, label: 'None' }, ...ARROW_GOALS.map((g) => ({ value: g, label: String(g) }))],
        onChange: (g) => setKind({ goal: g || null }),
        fk: 'goal',
      }),
    }),
    ...(past ? formSections('blank', form, change) : []),
  ];
}

/**
 * Step 2 for shooting (#/new/shooting/<kind>): one page for training, competition and blank bale,
 * switched by the tabs at the top. When and the equipment stay when the kind is switched.
 */
export function renderShootingSetup(ctx, kind) {
  const st = setupState(ctx);
  const { settings, setup, set } = st;
  const fields = setup.kinds?.[kind] || fromLast(settings, kind);
  const setKind = (patch) => set({ kinds: { ...setup.kinds, [kind]: { ...fields, ...patch } } });
  const quietKind = (patch) => st.quiet({ kinds: { ...setup.kinds, [kind]: Object.assign(fields, patch) } });
  const blank = kind === 'blank';
  const active = blank ? null : ctx.running.get();

  const { section: when, whenDate, whenTime, past } = whenSection(ctx, st, { duration: !blank });
  const equipment = equipmentSection(ctx, st, { kind, distance: blank ? null : fields.distance });

  const startScored = async () => {
    const { distance, face, arrowsPerEnd, grading, competition: comp } = fields;
    // only one session runs at a time: the running-session module asks about the one in progress
    const res = await ctx.running.start({
      date: whenDate,
      time: whenTime,
      pastMinutes: past ? (setup.pastMinutes ?? 0) : null,
      type: kind,
      distance,
      face,
      arrowsPerEnd,
      grading: grading !== false,
      competition:
        kind === 'competition'
          ? { ...emptyCompetition(), event: comp.event, round: comp.round, conditions: comp.conditions }
          : null,
      ...equipment.chosenGear(),
    });
    if (res.status === 'cancelled') return;
    ctx.ui.quietSet({ setup: null });
    if (res.status === 'started') ctx.navigate('log', { replace: true });
  };

  // Start: the blank bale's timer starts now (nothing ran while the setup was open); one already
  // open goes on as it is
  const blankOpen = blank && ctx.openForms.list().some((f) => f.type === 'blank');
  const startBlank = () => {
    if (!blankOpen) ctx.openForms.start('blank', { goal: fields.goal ?? null, gear: equipment.choice });
    ctx.ui.quietSet({ setup: null });
    ctx.navigate('blank', { replace: true });
  };
  // a past start: saved straight to History (an open blank bale is left running)
  const logBlank = async () => {
    const form = fields.form || emptyForm('blank');
    const res = await ctx.openForms.save('blank', {
      fields: { ...form, ...(fields.goal ? { goal: fields.goal } : {}) },
      date: whenDate,
      time: whenTime,
      past: true,
      close: false,
      gear: equipment.chosenGear(),
    });
    if (res.status !== 'saved') return;
    // remembered as the last blank bale setup, as a started one is (openForms.start)
    ctx.saveSettings(rememberSetup(settings, 'blank', { goal: fields.goal ?? null, gear: equipment.choice }));
    ctx.ui.quietSet({ setup: null });
    ctx.navigate(`history/${res.session.id}`, { replace: true });
  };

  const summary = blank
    ? ['Blank bale', fields.goal ? `goal ${fields.goal} arrows` : '', equipment.gearName].filter(Boolean).join(' · ')
    : setupSummary(fields, arrowsText(fields.arrowsPerEnd), fields.grading === false ? 'no grading' : '', equipment.gearName);

  const body = h(
    'div',
    { class: 'apl-screen-body', role: 'tabpanel', id: 'shooting-panel', 'aria-labelledby': `kind-${kind}` },
    blankOpen
      ? APL.Banner({ title: 'A blank bale session is running', action: { label: T.continueSession, href: '#/blank' } })
      : null,
    active
      ? APL.Banner({
          title: T.inProgress(setupSummary(active), active.ends.length),
          action: { label: T.continueSession, href: '#/log' },
        })
      : null,
    when,
    kind === 'competition' ? competitionSection(fields, { setKind, quietKind }) : null,
    ...(blank ? blankSections(fields, setKind, { past, quietKind }) : scoredSections(fields, setKind)),
    equipment.section,
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: 'Shooting',
        // going back gives the setup up (what was picked is forgotten)
        onBack: () => {
          ctx.ui.quietSet({ setup: null });
          ctx.navigate('new', { replace: true });
        },
        backLabel: 'Back to session types',
      }),
      kindTabs(ctx, kind),
      body,
      APL.BottomBar({
        summary,
        children: APL.Button({
          children: blank && past ? 'Save blank bale' : blankOpen ? 'Continue blank bale' : START_LABELS[kind],
          trailingIcon: blank && past ? null : 'arrowRight',
          onClick: !blank ? startScored : past ? logBlank : startBlank,
          fk: 'setup-start',
        }),
      }),
    ),
  };
}

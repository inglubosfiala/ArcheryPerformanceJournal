// New session: the session types, and the setup of a scored session (training, competition), drawn
// with the APL components after the design system's SessionSetup screen. The running-session module
// owns starting the session; this page holds the setup being picked (ui state `setup`).
import { h, formatDate, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import {
  DISTANCES,
  DISTANCE_DEFAULTS,
  SETUP_FACES,
  ARROWS_PER_END_MIN,
  ARROWS_PER_END_MAX,
  DEFAULT_ARROWS_PER_END,
} from '../scoring.js';
import { SESSION_TYPES, TYPE_LABELS, hourMinute, setupSummary, emptyCompetition } from '../sessionTypes.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { sessionDates } from './common.js';
import { datePicker, timePicker } from './pickers.js';
import { faceParts, faceId, FACE_SIZES, kindsForSize, faceForSize } from './setupFaces.js';

const TYPE_HINTS = {
  training: 'Score arrow by arrow with M / S grades',
  blank: 'Count arrows at the blank bale, no score',
  competition: 'Scored like training, with event and placement',
  strength: 'Holding and draw drills, effort',
  mental: 'Visualisation, breathing, shot routine…',
  manual: 'Type in the arrows or the duration afterwards',
};

const ARROW_PRESETS = [3, 4, 5, 6];
const arrowsText = (n) => `${n} ${n === 1 ? 'arrow' : 'arrows'}/end`;

/** Step 1: the session types. Tapping one opens its setup; the last one picked is tagged. */
export function renderTypeChoice(ctx) {
  const last = ctx.ui.get().newType;
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: 'New session',
        onBack: () => ctx.navigate('home'),
        backLabel: 'Back to dashboard',
      }),
      h(
        'div',
        { class: 'apl-screen-body' },
        APL.Section({
          label: 'Session type',
          id: 'new-type',
          children: h(
            'nav',
            { class: 'type-list', 'aria-labelledby': 'new-type-label' },
            SESSION_TYPES.map((t) =>
              h(
                'a',
                {
                  class: 'type-option',
                  href: `#/new/${t}`,
                  dataset: { fk: `type-${t}` },
                  onClick: () => ctx.ui.quietSet({ newType: t }),
                },
                h(
                  'span',
                  { class: 'apl-stack type-option-text' },
                  h('span', { class: 'apl-t' }, TYPE_LABELS[t]),
                  h('span', { class: 'apl-cap' }, TYPE_HINTS[t]),
                ),
                last === t ? APL.Badge({ children: 'Last used', tone: 'neutral' }) : null,
                h('span', { class: 'type-option-go', 'aria-hidden': 'true' }, icons.forward()),
              ),
            ),
          ),
        }),
      ),
    ),
  };
}

/** Step 2 for a scored session: when, distance, face, arrows per end, (competition), equipment. */
export function renderScoredSetup(ctx, type, active = null) {
  const settings = ctx.repo.getSettings();
  // distance and face are remembered from the last session; arrows per end always start at the default
  const last = settings.lastSetup;
  // a face no longer offered (the single 40 cm 10–6 spot) falls back to the triple
  const lastFace = SETUP_FACES.includes(last.face) ? last.face : '40t';
  const setup = ctx.ui.get().setup || {
    distance: last.distance,
    face: lastFace,
    arrowsPerEnd: DEFAULT_ARROWS_PER_END,
    competition: emptyCompetition(),
  };
  const set = (patch) => ctx.ui.set({ setup: { ...setup, ...patch } });
  // typing in a text field stores the draft without re-rendering, so the field keeps focus
  const quiet = (patch) => ctx.ui.quietSet({ setup: Object.assign(setup, patch) });

  // When: now by default; an earlier date / time logs the session afterwards (no running timer).
  // Fields left untouched follow the clock, so a draft kept open is not dated when it was opened.
  const when = setup.when || {};
  const whenDate = when.date || todayIso();
  const whenTime = when.time || hourMinute(new Date());
  const past = L.isPastStart(whenDate, whenTime);
  const setWhen = (patch) => set({ when: { ...when, ...patch } });

  // equipment: the Gear tab's setup by default, or any saved setup
  const snapshots = ctx.repo.list('gearSnapshots', {
    sort: (a, b) => b.createdAt.localeCompare(a.createdAt),
  });
  const gearOpts = gearChoices({ settings, snapshots });
  const gearChoice = gearOpts.options.some((o) => o[0] === setup.gear) ? setup.gear : gearOpts.value;
  const chosenGear = () =>
    gearForChoice(gearChoice, { settings, snapshots }) || { gear: null, gearSnapshotId: null };
  const gearDetail = (id) => {
    if (id === 'none') return 'Log without a bow setup';
    if (id === 'current') return 'From the Gear tab';
    const sn = snapshots.find((x) => x.id === id);
    return sn ? `Saved ${formatDate(sn.createdAt.slice(0, 10))}` : null;
  };
  const gearName = gearChoice === 'none' ? null : gearOpts.options.find((o) => o[0] === gearChoice)?.[1];

  const start = async () => {
    // only one session runs at a time: the running-session module asks about the one in progress
    const { distance, face, arrowsPerEnd } = setup;
    const res = await ctx.running.start({
      date: whenDate,
      time: whenTime,
      pastMinutes: past ? (setup.pastMinutes ?? 0) : null,
      type,
      distance,
      face,
      arrowsPerEnd,
      competition: type === 'competition' ? { ...emptyCompetition(), ...setup.competition } : null,
      ...chosenGear(),
    });
    if (res.status === 'cancelled') return;
    ctx.ui.quietSet({ setup: null });
    if (res.status === 'started') ctx.navigate('log', { replace: true });
  };

  // the back button gives the setup up (what was picked is forgotten) and goes back to the session types
  const cancel = () => {
    ctx.ui.quietSet({ setup: null });
    ctx.navigate('new', { replace: true });
  };

  const textField = (label, value, attrs, onInput) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('input', { class: 'input', value, autocomplete: 'off', ...attrs, onInput }),
    );
  const compField = (key, label, placeholder) =>
    textField(label, setup.competition?.[key] || '', { placeholder, dataset: { fk: `comp-${key}` } }, (e) =>
      quiet({ competition: { ...setup.competition, [key]: e.target.value } }),
    );

  const lastArrows = last.arrowsPerEnd ?? DEFAULT_ARROWS_PER_END;
  const { size, kind } = faceParts(setup.face) || faceParts(lastFace);
  const suggested = DISTANCE_DEFAULTS[setup.distance]?.face === setup.face;

  const body = h(
    'div',
    { class: 'apl-screen-body' },
    active
      ? h(
          'div',
          { class: 'banner', role: 'status' },
          h('span', null, T.inProgress(setupSummary(active), active.ends.length)),
          h('a', { class: 'btn btn-primary btn-sm', href: '#/log' }, T.continueSession),
        )
      : null,
    APL.RepeatCard({
      title: 'Same as last session',
      summary: setupSummary({ distance: last.distance, face: lastFace }, arrowsText(lastArrows)),
      onClick: () => set({ distance: last.distance, face: lastFace, arrowsPerEnd: lastArrows }),
      fk: 'setup-repeat',
    }),
    APL.Section({
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
            apl: true,
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
        // logged afterwards: the duration is typed in, the timer stays stopped
        past
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
        past ? h('p', { class: 'apl-cap' }, 'Logged afterwards: no running timer.') : null,
      ],
    }),
    APL.Section({
      label: T.distance,
      id: 'setup-dist',
      children: APL.ChipGrid({
        label: 'Distance',
        value: setup.distance,
        options: DISTANCES.map((d) => ({ value: d, label: `${d} m` })),
        // picking a distance suggests its usual face
        onChange: (d) => set({ distance: d, ...DISTANCE_DEFAULTS[d] }),
        fk: 'dist',
      }),
    }),
    APL.Section({
      label: T.targetFace,
      id: 'setup-face',
      accessory: suggested ? APL.Badge({ children: `Suggested for ${setup.distance} m` }) : null,
      children: [
        APL.FaceCard({ size, kind }),
        APL.SegmentedControl({
          label: 'Face size',
          value: size,
          options: FACE_SIZES.map((v) => ({ value: v, label: `${v} cm` })),
          onChange: (v) => set({ face: faceForSize(v, setup.face) }),
          fk: 'face-size',
        }),
        kindsForSize(size).length > 1
          ? APL.OptionPills({
              label: 'Face type',
              value: kind,
              options: kindsForSize(size).map((k) => ({ value: k, label: APL.FACE_NAMES[k] })),
              onChange: (k) => set({ face: faceId(size, k) }),
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
        value: setup.arrowsPerEnd,
        min: ARROWS_PER_END_MIN,
        max: ARROWS_PER_END_MAX,
        onChange: (n) => set({ arrowsPerEnd: n }),
        fk: 'n',
      }),
      children: APL.ChipGrid({
        label: 'Arrows per end',
        numeric: true,
        value: setup.arrowsPerEnd,
        options: ARROW_PRESETS.map((n) => ({ value: n, label: String(n) })),
        onChange: (n) => set({ arrowsPerEnd: n }),
        fk: 'n-chip',
      }),
    }),
    type === 'competition'
      ? APL.Section({
          label: 'Competition',
          id: 'setup-comp',
          children: [
            compField('event', 'Event', 'e.g. Indoor Cup Bratislava'),
            h(
              'div',
              { class: 'apl-grid-2' },
              compField('round', 'Round', 'e.g. WA 18 m'),
              compField('conditions', 'Conditions', 'hall, wind, light'),
            ),
          ],
        })
      : null,
    APL.Section({
      label: 'Equipment',
      id: 'setup-gear',
      children: h(
        'div',
        { class: 'apl-list', role: 'group', 'aria-labelledby': 'setup-gear-label' },
        gearOpts.options.map(([id, name]) =>
          APL.SelectCard({
            title: name,
            detail: gearDetail(id),
            selected: id === gearChoice,
            onClick: () => set({ gear: id }),
            fk: `gear-${id}`,
          }),
        ),
        APL.AddButton({ children: 'Add equipment', onClick: () => ctx.navigate('gear'), fk: 'gear-add' }),
      ),
    }),
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: `New ${TYPE_LABELS[type].toLowerCase()} session`,
        onBack: cancel,
        backLabel: 'Cancel and back to session types',
      }),
      body,
      APL.BottomBar({
        summary: setupSummary(setup, arrowsText(setup.arrowsPerEnd), gearName),
        children: APL.Button({
          children: T.start,
          trailingIcon: 'arrowRight',
          onClick: start,
          fk: 'setup-start',
        }),
      }),
    ),
  };
}

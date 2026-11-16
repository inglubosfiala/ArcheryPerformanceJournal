// The overview of a scored session, one page for two moments: right after Finish (`finished`: a
// "Session saved" banner, the review open for writing, Later / Save review) and from History
// (`history`: a read view where each part has its own Edit). Top to bottom: the score summary, the
// process grades, the performance review, the group, the ends and the details.
// The review section is also used on the page of a form session.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { computeStats, fmt } from '../stats.js';
import { faceLabel } from '../scoring.js';
import { formatDuration } from '../sessionLogic.js';
import {
  TYPE_LABELS,
  sessionType,
  emptyReview,
  ROUNDS,
  CONDITIONS,
  parseConditions,
  joinConditions,
} from '../sessionTypes.js';
import { scoreCounts, averageDelta, gradeDistribution, gradeInsight } from '../sessionInsights.js';
import { whenCard, gearCard } from './common.js';

// ---------------------------------------------------------------- state of the page (ui `ov`)

/** What the page has open for this session: review editing, a sheet, the group filter, all ends. */
function overviewState(ctx, ss) {
  const cur = ctx.ui.get().ov;
  const ov = cur?.id === ss.id ? cur : { id: ss.id };
  return {
    ov,
    set: (patch) => ctx.ui.set({ ov: { ...ov, ...patch } }),
    quiet: (patch) => ctx.ui.quietSet({ ov: Object.assign(ov, patch) }),
  };
}

// ---------------------------------------------------------------- small parts

const p2 = (n) => String(n).padStart(2, '0');
/** "18:20–19:32" from a start time and a duration; just the start without a duration. */
function timeSpan(time, minutes) {
  if (!time) return '';
  if (minutes == null) return time;
  const [hh, mm] = time.split(':').map(Number);
  const end = (hh * 60 + mm + minutes) % (24 * 60);
  return `${time}–${p2(Math.floor(end / 60))}:${p2(end % 60)}`;
}

/** "Sun 15 Nov · 18:20–19:32 · Indoor" */
function whenLine(ss, setupName) {
  return [formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short' }), timeSpan(ss.time, ss.minutes), setupName]
    .filter(Boolean)
    .join(' · ');
}

/** A card section of the overview: an UPPERCASE heading, an optional accessory, the content. */
function ovCard(id, label, children, { accessory = null, cls = null } = {}) {
  return h(
    'section',
    { class: ['ov-card', cls], 'aria-labelledby': `ov-${id}` },
    h('div', { class: 'ov-card-head' }, h('h2', { class: 'apl-label', id: `ov-${id}` }, label), accessory),
    children,
  );
}

/** The small Edit / Done button of a section. */
const editButton = (label, onClick, fk, pressed = null) =>
  h(
    'button',
    { type: 'button', class: 'ov-edit', onClick, dataset: { fk }, 'aria-pressed': pressed == null ? null : String(pressed) },
    icons.pencil(),
    label,
  );

// ---------------------------------------------------------------- B1 score summary

function summaryCard(ctx, ss, st) {
  const counts = scoreCounts(ss.ends);
  const delta = averageDelta(ss, ctx.finished.list());
  const tile = (n, label) =>
    h('span', { class: 'ov-count' }, h('span', { class: 'ov-count-n' }, String(n)), h('span', { class: 'ov-count-l' }, label));
  const facts = [
    `${ss.distance} m · ${faceLabel(ss.face)}`,
    ss.minutes != null ? formatDuration(ss.minutes) : null,
    `${st.ld} ${st.ld === 1 ? 'let-down' : 'let-downs'} (${st.cld} correct)`,
  ].filter(Boolean);
  return h(
    'section',
    { class: 'ov-card ov-summary', 'aria-label': 'Score summary' },
    h(
      'div',
      { class: 'ov-summary-top' },
      h(
        'div',
        { class: 'ov-stack' },
        h('span', { class: 'apl-cap13' }, `Total · ${st.arrows} ${st.arrows === 1 ? 'arrow' : 'arrows'}`),
        h('span', { class: 'ov-total' }, String(st.total)),
      ),
      h(
        'div',
        { class: 'ov-stack ov-stack--end' },
        h('span', { class: 'apl-cap13' }, 'Per arrow'),
        h('span', { class: 'ov-avg' }, fmt(st.avgArrow, 2)),
        delta
          ? h(
              'span',
              { class: ['ov-delta', delta.delta < 0 && 'is-down'] },
              `${delta.delta >= 0 ? '+' : '−'}${Math.abs(delta.delta).toFixed(2)} vs your ${ss.distance} m average`,
            )
          : null,
      ),
    ),
    h('div', { class: 'ov-counts' }, tile(counts.x, 'X'), tile(counts.ten, '10'), tile(counts.nine, '9'), tile(counts.low, '8 and less')),
    h('div', { class: 'ov-facts' }, facts.map((f) => h('span', null, f))),
  );
}

// ---------------------------------------------------------------- B2 process grades

const ORD = ['ones', 'twos', 'threes', 'fours', 'fives'];

function gradeBlock(label, short, dist) {
  const { counts, n, avg } = dist;
  const worse = counts[2] + counts[3] + counts[4];
  return h(
    'div',
    { class: 'ov-grade' },
    h('span', { class: 'ov-grade-head' }, h('span', { class: 'ov-grade-label' }, label), h('span', { class: 'ov-grade-avg' }, fmt(avg))),
    n
      ? h(
          'div',
          {
            class: 'ov-dist',
            role: 'img',
            'aria-label': `${short} grades: ${counts.map((c, i) => `${c} ${ORD[i]}`).join(', ')}`,
          },
          counts.map((c, i) => (c ? h('span', { class: `ov-dist-seg g${i + 1}`, style: { flexGrow: String(c) } }) : null)),
        )
      : h('div', { class: 'ov-dist ov-dist--empty', 'aria-hidden': 'true' }),
    h('span', { class: 'apl-cap' }, n ? `${counts[0]} × ${short}1 · ${worse} × ${short}3+` : 'Not graded'),
  );
}

function gradesCard(ss) {
  const insight = gradeInsight(ss.ends);
  return ovCard('grades', 'Process grades', [
    h(
      'div',
      { class: 'ov-grades' },
      gradeBlock('Mental (M)', 'M', gradeDistribution(ss.ends, 'm')),
      gradeBlock('Cycle (S)', 'S', gradeDistribution(ss.ends, 's')),
    ),
    insight
      ? h(
          'p',
          { class: 'ov-insight' },
          'Arrows with a full program (',
          h('strong', null, 'M1'),
          ') scored ',
          h('strong', null, fmt(insight.m1.avg)),
          '; with M3 or worse ',
          h('strong', null, fmt(insight.m3.avg)),
          '.',
        )
      : null,
  ]);
}

// ---------------------------------------------------------------- B3 performance review

const PROMPTS = [
  { key: 'good', label: () => T.reviewGood, ph: () => T.reviewGoodPh, tone: 'good' },
  { key: 'workOn', label: () => T.reviewWorkOn, ph: () => T.reviewWorkOnPh, tone: 'work' },
  { key: 'how', label: () => T.reviewHow, ph: () => T.reviewHowPh, tone: 'how' },
];

/**
 * `word` put into `text` at the cursor (start…end replaced), with a space before it when it would
 * stick to the previous word and after it when it would stick to the next. Returns the new text and
 * the cursor after the word.
 */
export function insertAtCursor(text, start, end, word) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s,.;:!?]/.test(after) ? ' ' : '';
  const head = `${before}${lead}${word}`;
  return { text: `${head}${trail}${after}`, cursor: head.length };
}

/** One prompt being written: the textarea and its cue chips (each inserts its word at the cursor). */
function promptEditor(ctx, ss, p) {
  const field = APL.TextArea({
    label: p.label(),
    rows: 4,
    placeholder: p.ph(),
    value: ss.review?.[p.key] || '',
    fk: `review-${p.key}`,
    onInput: (e) => ctx.finished.setReview(ss.id, p.key, e.target.value),
  });
  const ta = field.querySelector('textarea');
  // where the cursor was last (a tap on a chip takes the focus away; an untouched field: the end)
  let caret = null;
  const remember = () => (caret = [ta.selectionStart, ta.selectionEnd]);
  for (const ev of ['keyup', 'click', 'select', 'input']) ta.addEventListener(ev, remember);
  const cue = (word) => () => {
    const [s, e] = caret || [ta.value.length, ta.value.length];
    const next = insertAtCursor(ta.value, s, e, word);
    ta.value = next.text;
    ta.focus();
    ta.setSelectionRange(next.cursor, next.cursor);
    remember();
    ctx.finished.setReview(ss.id, p.key, next.text);
  };
  return h(
    'div',
    { class: `ov-prompt ov-prompt--${p.tone}` },
    field,
    h(
      'div',
      { class: 'ov-cues', role: 'group', 'aria-label': `Quick words for ${p.label().toLowerCase()}` },
      T.reviewCues[p.key].map((w) =>
        h('button', { type: 'button', class: 'ov-cue', 'aria-label': `Insert "${w}"`, onClick: cue(w), dataset: { fk: `cue-${p.key}-${w}` } }, `+ ${w}`),
      ),
    ),
  );
}

/** One prompt as read: its colour dot and label, then the text (or "Not written yet"). */
function promptRead(ss, p) {
  const text = (ss.review?.[p.key] || '').trim();
  return h(
    'div',
    { class: `ov-prompt ov-prompt--${p.tone}` },
    h('h3', { class: 'ov-prompt-label' }, h('span', { class: 'ov-dot', 'aria-hidden': 'true' }), p.label()),
    h('p', { class: ['ov-prompt-text', !text && 'is-empty'] }, text || T.notWrittenYet),
  );
}

/**
 * The performance review (good / work on / how), saved as it is typed (finished.setReview).
 * `editing`: the textareas with cue chips, else the read view. `onToggle`: the section's Edit / Done
 * (none while the page itself is the writing step).
 */
export function reviewSection(ctx, ss, { editing, onToggle = null }) {
  if (!ss.review) ss = { ...ss, review: emptyReview() };
  return ovCard(
    'review',
    T.review,
    PROMPTS.map((p) => (editing ? promptEditor(ctx, ss, p) : promptRead(ss, p))),
    {
      cls: editing && 'is-editing',
      accessory: onToggle ? editButton(editing ? 'Done' : 'Edit', onToggle, 'review-edit', editing) : null,
    },
  );
}

// ---------------------------------------------------------------- B7 details and their sheets

/** Competition details as chips and fields, saved as they change (placement too). */
function competitionEditor(ctx, ss, { ov, set }) {
  const comp = ss.competition || {};
  const save = (key, value, rerender = true) => {
    if (ctx.finished.setCompetition(ss.id, key, value).status === 'saved' && rerender) ctx.rerender();
  };
  const round = comp.round || '';
  const other = !!ov.otherRound || (!!round && !ROUNDS.includes(round));
  const { chips, rest } = parseConditions(comp.conditions);
  const text = (key, label, placeholder, value = comp[key] || '') =>
    APL.TextField({ label, placeholder, value, fk: `comp-${key}`, onInput: (e) => save(key, e.target.value, false) });
  return [
    text('event', 'Event', 'Event name'),
    h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Round'),
    APL.OptionPills({
      label: 'Round',
      value: other ? 'Other' : round,
      options: [...ROUNDS, 'Other'].map((r) => ({ value: r, label: r })),
      // tapping the chosen round again clears it; Other opens a field for the round's name
      onChange: (r) => {
        if (r === 'Other') {
          if (!other) save('round', '', false);
          set({ otherRound: !other });
        } else {
          save('round', r === round ? '' : r, false);
          set({ otherRound: false });
        }
      },
      fk: 'comp-round',
    }),
    other ? text('round', 'Other round', 'e.g. Indoor 2 × 30') : null,
    h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Conditions'),
    APL.OptionPills({
      label: 'Conditions',
      multiple: true,
      value: chips,
      options: CONDITIONS.map((c) => ({ value: c, label: c })),
      onChange: (c) => save('conditions', joinConditions(chips.includes(c) ? chips.filter((x) => x !== c) : [...chips, c], rest)),
      fk: 'comp-cond',
    }),
    APL.TextField({
      label: 'Other conditions',
      value: rest,
      fk: 'comp-cond-text',
      onInput: (e) => save('conditions', joinConditions(chips, e.target.value), false),
    }),
    text('placement', 'Placement', 'e.g. 3rd of 24'),
  ];
}

/** The details of a session in History: rows that open their editor (a sheet), or just show. */
function detailsCard(ctx, ss, st, setupName, set) {
  const row = (k, v, sheet) =>
    sheet
      ? h(
          'button',
          { type: 'button', class: 'ov-row', onClick: () => set({ sheet }), 'aria-haspopup': 'dialog', dataset: { fk: `detail-${sheet}-${k}` } },
          h('span', { class: 'ov-row-k' }, k),
          h('span', { class: 'ov-row-v' }, v || '—'),
          h('span', { class: 'ov-row-go', 'aria-hidden': 'true' }, icons.chevron()),
        )
      : h('div', { class: 'ov-row' }, h('span', { class: 'ov-row-k' }, k), h('span', { class: 'ov-row-v' }, v), h('span', { class: 'ov-row-go' }));
  const comp = ss.competition || {};
  const isComp = sessionType(ss) === 'competition';
  return h(
    'section',
    { class: 'ov-card ov-list', 'aria-labelledby': 'ov-details' },
    h('div', { class: 'ov-card-head ov-list-head' }, h('h2', { class: 'apl-label', id: 'ov-details' }, 'Details')),
    row('Type', TYPE_LABELS[sessionType(ss)]),
    row('Date & time', [formatDate(ss.date, { day: 'numeric', month: 'short' }), ss.time].filter(Boolean).join(' · '), 'when'),
    row('Duration', ss.minutes != null ? formatDuration(ss.minutes) : null, 'when'),
    row('Distance & face', `${ss.distance} m · ${faceLabel(ss.face)}`),
    row('Equipment', setupName || (ss.gear ? 'As recorded' : 'None'), 'gear'),
    row('Let-downs', `${st.ld} · ${st.cld} correct`),
    isComp ? row('Event', comp.event, 'comp') : null,
    isComp ? row('Round', comp.round, 'comp') : null,
    isComp ? row('Conditions', comp.conditions, 'comp') : null,
    isComp ? row('Placement', comp.placement, 'comp') : null,
  );
}

/** The sheet open on the page, if any: the ⋯ menu or a detail's editor. */
function overlayFor(ctx, ss, { ov, set }) {
  const close = () => set({ sheet: null });
  const sheet = (title, children, returnFk) => ({
    onClose: close,
    returnFk,
    node: APL.Dialog({ sheet: true, title, idPrefix: 'ov-sheet', onClose: close, closeLabel: 'Close', children: h('div', { class: 'ov-sheet' }, children) }),
  });
  if (ov.sheet === 'menu') {
    const del = async () => {
      ctx.ui.quietSet({ ov: { ...ov, sheet: null } });
      ctx.rerender();
      const { status } = await ctx.finished.moveToDeleted(ss.id);
      if (status === 'deleted') ctx.toast('Moved to Recently deleted.');
      if (status === 'deleted' || status === 'none') ctx.navigate('history', { replace: true });
    };
    return sheet(
      'Session options',
      h(
        'div',
        { class: 'gear-menu', role: 'group', 'aria-label': 'Session options' },
        h(
          'button',
          { type: 'button', class: 'gear-menu-item danger', onClick: del, dataset: { fk: 'menu-delete' } },
          h('span', { class: 'gear-menu-icon' }, icons.trash()),
          T.deleteSession,
        ),
      ),
      'ov-more',
    );
  }
  const finishedGear = (choice) => {
    if (ctx.finished.setGear(ss.id, choice).status === 'saved') ctx.rerender();
  };
  if (ov.sheet === 'when') return sheet('Date, time and duration', whenCard(ctx, ss), 'detail-when-Date & time');
  if (ov.sheet === 'gear') return sheet('Equipment', gearCard(ctx, ss, finishedGear), 'detail-gear-Equipment');
  if (ov.sheet === 'comp') return sheet('Competition', competitionEditor(ctx, ss, { ov, set }), 'detail-comp-Event');
  return null;
}

// ---------------------------------------------------------------- the page

/**
 * The overview of a finished scored session. `mode`: 'finished' (right after Finish) or 'history'.
 * `sections`: the group and the ends, drawn by the caller between the review and the details.
 */
export function renderOverview(ctx, ss, { mode = 'history', sections = [] } = {}) {
  const finished = mode === 'finished';
  const state = overviewState(ctx, ss);
  const { ov, set } = state;
  const st = computeStats(ss.ends);
  const label = TYPE_LABELS[sessionType(ss)];
  const usedSetup = ss.gearSnapshotId ? ctx.repo.get('setups', ss.gearSnapshotId) : null;
  const setupName = usedSetup?.name || null;
  const editingReview = finished || !!ov.review;

  const header = h(
    'header',
    { class: 'apl apl-header ov-header' },
    finished
      ? null
      : APL.IconButton({ icon: 'back', label: T.backToLog, onClick: () => ctx.navigate('history'), fk: 'screen-back' }),
    h(
      'div',
      { class: ['ov-title', finished && 'ov-title--pad'] },
      h('h1', null, finished ? `${label} finished` : `${label} · ${st.total}`),
      h('span', { class: 'apl-cap' }, whenLine(ss, setupName)),
    ),
    finished
      ? null
      : h(
          'button',
          {
            type: 'button',
            class: 'apl-iconbtn',
            'aria-label': 'Session options',
            'aria-haspopup': 'dialog',
            onClick: () => set({ sheet: 'menu' }),
            dataset: { fk: 'ov-more' },
          },
          icons.more(),
        ),
  );

  const body = h(
    'div',
    { class: 'apl-screen-body ov-body' },
    finished
      ? h(
          'div',
          { class: 'ov-saved', role: 'status' },
          icons.check(),
          h('span', null, h('strong', null, 'Session saved.'), ' Take two minutes for the review while it is fresh.'),
        )
      : null,
    summaryCard(ctx, ss, st),
    gradesCard(ss),
    reviewSection(ctx, ss, { editing: editingReview, onToggle: finished ? null : () => set({ review: !ov.review }) }),
    ...sections,
    finished ? null : detailsCard(ctx, ss, st, setupName, set),
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      body,
      finished
        ? APL.BottomBar({
            children: h(
              'div',
              { class: 'ov-actions' },
              APL.Button({ children: 'Later', variant: 'secondary', onClick: () => ctx.navigate('home', { replace: true }), fk: 'ov-later' }),
              APL.Button({
                children: 'Save review',
                onClick: () => {
                  ctx.toast('Review saved.');
                  ctx.navigate(`history/${encodeURIComponent(ss.id)}`, { replace: true });
                },
                fk: 'ov-save-review',
              }),
            ),
          })
        : null,
    ),
    overlay: finished ? null : overlayFor(ctx, ss, state),
  };
}

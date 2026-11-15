// History tab: training log list → session detail (HANDOFF §6).
import { h, s, formatDate } from '../../core/dom.js';
import { confirmDialog } from './confirm.js';
import { sheetPoint, isMultiSpot, spotCentres } from '../scoring.js';
import { computeStats, sumArrows, fmt } from '../stats.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, gearCard, whenCard, backBar } from './common.js';
import { VB, faceRings, faceSheet, faceViewBox } from './face.js';
import { TYPE_LABELS, isScored, sessionType, formSummary, setupSummary } from '../sessionTypes.js';
import { formSections } from './sessionForms.js';
import { formatDuration } from '../sessionLogic.js';
import { TRASH_DAYS } from '../../config.js';

/** The finished session's questions to the archer (the `confirm` adapter of ctx.finished). */
export function askAboutFinishedSession(q) {
  if (q.kind === 'purge') {
    return confirmDialog({
      title: 'Delete for good?',
      message: 'The session is removed permanently. This cannot be undone.',
      confirmLabel: T.delete,
      danger: true,
    });
  }
  return confirmDialog({ title: 'Delete session?', message: T.confirmDeleteSession, confirmLabel: T.delete, danger: true });
}

export function renderHistory(ctx, params) {
  const id = params[0];
  if (id === 'deleted') return renderTrash(ctx);
  if (id) {
    const session = ctx.finished.get(id);
    if (session) return renderDetail(ctx, session);
  }
  return renderList(ctx);
}

const typeBadge = (ss) => h('span', { class: `type-badge type-${sessionType(ss)}` }, TYPE_LABELS[sessionType(ss)]);

/** Date and start time on a list card: "Thu, 12 Nov 2026 · 18:00". */
const listWhen = (ss) => [formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), ss.time ? ` · ${ss.time}` : ''];

/** Delete on a session's page: after a yes it goes to Recently deleted and the page returns to the log. */
async function deleteSession(ctx, ss) {
  const { status } = await ctx.finished.moveToDeleted(ss.id);
  if (status === 'deleted') ctx.toast('Moved to Recently deleted.');
  // gone already (e.g. deleted on another device): back to the log as well
  if (status === 'deleted' || status === 'none') ctx.navigate('history', { replace: true });
}

/** List card of a strength or mental session. */
function formListCard(ss) {
  const review = ss.review?.workOn?.trim();
  return h(
    'a',
    { class: 'card session-card', href: `#/history/${encodeURIComponent(ss.id)}` },
    h(
      'div',
      { class: 'spread' },
      h('strong', null, ...listWhen(ss)),
      typeBadge(ss),
    ),
    h('div', { class: 'muted small' }, formSummary(ss) || '—'),
    review ? h('div', { class: 'small clamp-2' }, `Improve: ${review}`) : null,
  );
}

function renderList(ctx) {
  const sessions = ctx.finished.list();
  const binned = ctx.finished.deleted().length;
  return {
    content: h(
      'div',
      { class: 'stack' },
      h('div', { class: 'title-row' }, h('h1', { class: 'page-title' }, T.trainingLog), h('span', { class: 'muted small' }, `${sessions.length} sessions`)),
      sessions.length ? null : card(null, h('p', { class: 'muted' }, T.noSessions)),
      h(
        'ul',
        { class: 'plain-list stack-sm' },
        sessions.map((ss) => {
          if (!isScored(ss.type)) return h('li', null, formListCard(ss));
          const st = computeStats(ss.ends);
          return h(
            'li',
            null,
            h(
              'a',
              { class: 'card session-card', href: `#/history/${encodeURIComponent(ss.id)}` },
              h(
                'div',
                { class: 'spread' },
                h('strong', null, ...listWhen(ss)),
                typeBadge(ss),
              ),
              h(
                'div',
                { class: 'muted small' },
                [ss.competition?.event, setupSummary(ss, `${ss.ends.length} ends`, ss.minutes != null ? formatDuration(ss.minutes) : '')]
                  .filter(Boolean)
                  .join(' · '),
              ),
              h(
                'div',
                { class: 'spread align-end' },
                h('div', { class: 'big-score' }, h('span', null, String(st.total)), h('span', { class: 'muted' }, ` / ${st.max}`)),
                h(
                  'div',
                  { class: 'mini-stats' },
                  h('span', null, 'M ', h('strong', null, fmt(st.avgM))),
                  h('span', null, 'S ', h('strong', null, fmt(st.avgS))),
                  h('span', null, 'Program ', h('strong', null, st.programPct == null ? '–' : `${st.programPct}%`)),
                ),
              ),
            ),
          );
        }),
      ),
      binned
        ? h('a', { class: 'btn btn-text trash-link', href: '#/history/deleted', dataset: { fk: 'trash-link' } }, icons.trash(), `Recently deleted (${binned})`)
        : null,
    ),
  };
}

/**
 * Top of a session's page: the back button alone on the right, then a card with the session type
 * as its title and the date / time (and, for scored sessions, the setup line) under it.
 */
function detailHeader(ss, detail) {
  return [
    backBar('#/history', T.backToLog),
    card(
      { class: 'detail-head', 'aria-labelledby': 'detail-title' },
      h('h1', { class: 'card-title detail-title', id: 'detail-title' }, `${TYPE_LABELS[sessionType(ss)]} session`),
      h('div', { class: 'detail-when' }, formatDate(ss.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), ss.time ? ` · ${ss.time}` : ''),
      detail ? h('div', { class: 'muted small' }, detail) : null,
    ),
  ];
}

/** Strength / mental session: its form (editable, saved as you go), the review and delete. */
function renderFormDetail(ctx, ss) {
  const change = (update, { rerender = true } = {}) => {
    if (ctx.finished.change(ss.id, update).status === 'saved' && rerender) ctx.rerender();
  };
  return {
    content: h(
      'div',
      { class: 'stack' },
      ...detailHeader(ss, null),
      card({ class: 'setup-card', 'aria-label': `${TYPE_LABELS[ss.type]} session` }, formSections(ss.type, ss, change)),
      whenCard(ctx, ss),
      ss.type === 'mental' ? null : gearCard(ctx, ss, finishedGear(ctx, ss)),
      reviewCard(ctx, ss),
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: () => deleteSession(ctx, ss) }, T.deleteSession),
    ),
  };
}

/** Competition details, editable (placement is usually known only after the event). */
function competitionCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('input', {
        class: 'input',
        value: ss.competition?.[key] || '',
        placeholder,
        autocomplete: 'off',
        dataset: { fk: `comp-${key}` },
        onInput: (e) => ctx.finished.setCompetition(ss.id, key, e.target.value),
      }),
    );
  return card(
    { 'aria-labelledby': 'comp-title' },
    h('h2', { class: 'card-title', id: 'comp-title' }, 'Competition'),
    field('event', 'Event', 'Event name'),
    h('div', { class: 'grid-2' }, field('round', 'Round', 'e.g. WA 18 m'), field('placement', 'Placement', 'e.g. 3rd of 24')),
    field('conditions', 'Conditions', 'hall, wind, light'),
  );
}

function renderDetail(ctx, ss) {
  if (!isScored(ss.type)) return renderFormDetail(ctx, ss);
  const st = computeStats(ss.ends);
  const dateLbl = formatDate(ss.date);
  const snapshot = ss.gearSnapshotId ? ctx.repo.get('gearSnapshots', ss.gearSnapshotId) : null;

  const tiles = [
    ['Total', String(st.total)],
    ['Avg arrow', fmt(st.avgArrow, 2)],
    ['10s (X)', `${st.tens} (${st.xs})`],
    ['Avg M', fmt(st.avgM)],
    ['Avg S', fmt(st.avgS)],
    ['M1–2 %', st.programPct == null ? '–' : `${st.programPct}%`],
  ];

  return {
    content: h(
      'div',
      { class: 'stack' },
      ...detailHeader(ss, setupSummary(ss, `${st.arrows} arrows`, ss.minutes != null ? formatDuration(ss.minutes) : '', snapshot?.name)),
      h(
        'dl',
        { class: 'tiles' },
        tiles.map(([label, value]) => h('div', { class: 'tile' }, h('dt', null, label), h('dd', null, value))),
      ),
      sessionType(ss) === 'competition' ? competitionCard(ctx, ss) : null,
      whenCard(ctx, ss),
      gearCard(ctx, ss, finishedGear(ctx, ss)),
      reviewCard(ctx, ss),
      sessionGroup(ss),
      card(
        { 'aria-labelledby': 'bym-title' },
        h('div', { class: 'spread' }, h('h2', { class: 'card-title', id: 'bym-title' }, T.avgByM), h('span', { class: 'muted small' }, `LD ${st.cld}/${st.ld} correct`)),
        h(
          'ul',
          { class: 'plain-list bars' },
          [1, 2, 3, 4, 5].map((g) => {
            const r = st.byM[g];
            const w = r.avgArrow == null ? 0 : Math.round(r.avgArrow * 10);
            return h(
              'li',
              { class: 'bar-row' },
              h('span', { class: `grade-badge g${g} wide` }, `M${g}`),
              h('div', { class: 'bar-track', role: 'img', 'aria-label': `M${g}: average arrow ${fmt(r.avgArrow)} over ${r.n} arrows` }, h('div', { class: 'bar-fill', style: { width: `${w}%` } })),
              h('span', { class: 'muted small num right' }, h('strong', { class: 'ink' }, fmt(r.avgArrow)), ` · ${r.n} arr`),
            );
          }),
        ),
      ),
      card(
        { class: 'card-flush', 'aria-labelledby': 'ends-title' },
        h('h2', { class: 'card-title pad-x', id: 'ends-title' }, T.ends),
        h(
          'div',
          { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Ends table, scrolls sideways' },
          h(
            'table',
            { class: 'ends-table' },
            h(
              'thead',
              null,
              h('tr', null, ['Date', 'End', 'Arrows', 'EndScore', 'Grade M', 'Grade S', 'Let-downs', 'Correct LD', 'Note'].map((c) => h('th', { scope: 'col' }, c))),
            ),
            h(
              'tbody',
              null,
              ss.ends.map((e, i) => {
                const es = computeStats([e]);
                return h(
                  'tr',
                  null,
                  h('td', { class: 'muted nowrap' }, dateLbl),
                  h('td', null, String(i + 1)),
                  h('td', { class: 'strong nowrap' }, e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join(' ')),
                  h('td', { class: 'strong' }, String(sumArrows(e.arrows))),
                  h('td', null, fmt(es.avgM)),
                  h('td', null, fmt(es.avgS)),
                  h('td', null, String(e.ld)),
                  h('td', null, String(e.cld)),
                  h('td', { class: 'muted note-cell' }, e.note || '—'),
                );
              }),
            ),
          ),
        ),
      ),
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: () => deleteSession(ctx, ss) }, T.deleteSession),
    ),
  };
}

/** The equipment picker's choice, stored on the finished session (the page is drawn again when it changed). */
const finishedGear = (ctx, ss) => (choice) => {
  if (ctx.finished.setGear(ss.id, choice).status === 'saved') ctx.rerender();
};

/** What went well / what to work on: free text, saved as you type. */
function reviewCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('textarea', {
        rows: 6,
        class: 'review-text',
        placeholder,
        value: ss.review?.[key] || '',
        dataset: { fk: `review-${key}` },
        onInput: (e) => ctx.finished.setReview(ss.id, key, e.target.value),
      }),
    );
  return card(
    { 'aria-labelledby': 'review-title' },
    h('h2', { class: 'card-title', id: 'review-title' }, T.review),
    field('good', T.reviewGood, T.reviewGoodPh),
    field('workOn', T.reviewWorkOn, T.reviewWorkOnPh),
    field('how', T.reviewHow, T.reviewHowPh),
  );
}

/** All arrows of the session placed on one target face, with the group centre (mean point of impact). */
function sessionGroup(ss) {
  const all = ss.ends.flatMap((e) => e.arrows).filter((a) => a.v != null);
  const placed = all.filter((a) => a.x != null && a.y != null);
  if (!placed.length) return null;
  const multi = isMultiSpot(ss.face);
  const mean = (g) => ({ x: g.reduce((t, a) => t + a.x, 0) / g.length, y: g.reduce((t, a) => t + a.y, 0) / g.length, spot: g[0].spot ?? 0 });
  // group centre per spot on a three-spot sheet, one for the whole face otherwise
  const centres = spotCentres(ss.face)
    .map((_, i) => placed.filter((a) => !multi || (a.spot ?? 0) === i))
    .filter((g) => g.length)
    .map((g) => sheetPoint(mean(g), ss.face));

  const sheet = groupFace({
    viewBox: faceViewBox(ss.face),
    face: faceSheet(ss.face),
    points: placed.map((a) => sheetPoint(a, ss.face)),
    centres,
    label: `Target face with ${placed.length} arrows of this session`,
  });
  // three-spot sheets also get every arrow on one spot, to see the overall group
  const combined = multi
    ? groupFace({
        viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`,
        face: faceRings(ss.face),
        points: placed.map((a) => ({ x: a.x * 100, y: a.y * 100 })),
        centres: [(({ x, y }) => ({ x: x * 100, y: y * 100 }))(mean(placed))],
        label: `All ${placed.length} arrows on one spot`,
      })
    : null;

  return card(
    { 'aria-labelledby': 'group-title' },
    h(
      'div',
      { class: 'spread' },
      h('h2', { class: 'card-title', id: 'group-title' }, 'Group'),
      h('span', { class: 'muted small' }, `${placed.length} of ${all.length} arrows placed on the face`),
    ),
    multi
      ? h(
          'div',
          { class: 'group-faces' },
          h('figure', null, sheet, h('figcaption', { class: 'muted small' }, 'By spot')),
          h('figure', null, combined, h('figcaption', { class: 'muted small' }, 'All spots together')),
        )
      : sheet,
  );
}

/** One face drawing with arrow dots and group-centre marks (SVG units, spot radius = 100). */
function groupFace({ viewBox, face, points, centres, label }) {
  return h(
    'div',
    { class: 'group-face' },
    s(
      'svg',
      { viewBox, role: 'img', 'aria-label': label },
      face,
      points.map((p) => s('circle', { cx: p.x, cy: p.y, r: 3.4, fill: 'rgba(20,24,28,0.75)', stroke: '#FFFFFF', 'stroke-width': 1.1 })),
      centres.map((c) =>
        s(
          'g',
          { transform: `translate(${c.x} ${c.y})` },
          s('circle', { r: 4.5, fill: 'none', stroke: '#E5007E', 'stroke-width': 1.6 }),
          s('path', { d: 'M-8 0h16M0 -8v16', stroke: '#E5007E', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
        ),
      ),
    ),
  );
}

/** Recently deleted: sessions kept TRASH_DAYS after Delete, to restore or delete for good. */
function renderTrash(ctx) {
  const items = ctx.finished.deleted();
  const left = (days) => (days <= 1 ? 'Removed within a day' : `Removed in ${days} days`);
  const summary = (ss) =>
    isScored(ss.type) ? setupSummary(ss, `${ss.ends.length} ends`, `${computeStats(ss.ends).total} points`) : formSummary(ss) || '—';
  const restore = (ss) => {
    const { status } = ctx.finished.restore(ss.id);
    if (status === 'restored') ctx.toast('Session restored.');
    if (status === 'restored' || status === 'none') ctx.rerender();
  };
  const purge = async (ss) => {
    const { status } = await ctx.finished.purge(ss.id);
    if (status === 'purged' || status === 'none') ctx.rerender();
  };
  return {
    content: h(
      'div',
      { class: 'stack' },
      backBar('#/history', 'Back to history'),
      h('h1', { class: 'page-title sm' }, 'Recently deleted'),
      h('p', { class: 'muted small' }, `Deleted sessions are kept here for ${TRASH_DAYS} days, then removed for good.`),
      items.length ? null : card(null, h('p', { class: 'muted' }, 'Nothing here.')),
      h(
        'ul',
        { class: 'plain-list stack-sm' },
        items.map(({ session: ss, daysLeft }) =>
          h(
            'li',
            null,
            card(
              { class: 'trash-card' },
              h('div', { class: 'spread' }, h('strong', null, ...listWhen(ss)), typeBadge(ss)),
              h('div', { class: 'muted small' }, summary(ss)),
              h('div', { class: 'muted xsmall' }, left(daysLeft)),
              h(
                'div',
                { class: 'row' },
                h('button', { type: 'button', class: 'btn btn-primary grow-1', dataset: { fk: `restore-${ss.id}` }, onClick: () => restore(ss) }, 'Restore'),
                h('button', { type: 'button', class: 'btn btn-text danger', onClick: () => purge(ss) }, 'Delete now'),
              ),
            ),
          ),
        ),
      ),
    ),
  };
}

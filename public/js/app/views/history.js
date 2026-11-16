// History tab: training log list → session detail (HANDOFF §6), drawn with the APL components.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { computeStats, fmt } from '../stats.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, gearCard, whenCard } from './common.js';
import { TYPE_LABELS, isScored, sessionType, formSummary, setupSummary } from '../sessionTypes.js';
import { formSections } from './sessionForms.js';
import { formatDuration } from '../sessionLogic.js';
import { competitionLogCard } from './competitionLog.js';
import { TRASH_DAYS } from '../../config.js';
import { renderOverview, reviewSection } from './sessionOverview.js';

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
  if (q.kind === 'delete-end') {
    return confirmDialog({
      title: `Delete end ${q.index + 1}?`,
      message: 'Its arrows, grades and let-downs are removed from the session. This cannot be undone.',
      confirmLabel: 'Delete end',
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
    if (session) return renderDetail(ctx, session, params[1] === 'review' && isScored(session.type) ? 'finished' : 'history');
  }
  return renderList(ctx);
}

const typeLabel = (ss) => TYPE_LABELS[sessionType(ss)];

/** Date and start time on a list row: "Thu 12 Nov 2026 · 18:00". */
const listWhen = (ss) =>
  `${formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${ss.time ? ` · ${ss.time}` : ''}`;

/** The setup line of a scored session: competition, distance, face, ends, duration. */
const scoredSummary = (ss) =>
  [ss.competition?.event, setupSummary(ss, `${ss.ends.length} ends`, ss.minutes != null ? formatDuration(ss.minutes) : '')]
    .filter(Boolean)
    .join(' · ');

/** Delete on a session's page: after a yes it goes to Recently deleted and the page returns to the log. */
async function deleteSession(ctx, ss) {
  const { status } = await ctx.finished.moveToDeleted(ss.id);
  if (status === 'deleted') ctx.toast('Moved to Recently deleted.');
  // gone already (e.g. deleted on another device): back to the log as well
  if (status === 'deleted' || status === 'none') ctx.navigate('history', { replace: true });
}

const deleteButton = (ctx, ss) =>
  h(
    'button',
    { type: 'button', class: 'btn btn-text danger apl-discard', onClick: () => deleteSession(ctx, ss) },
    T.deleteSession,
  );

/** One session in the list. */
function sessionRow(ss) {
  const href = `#/history/${encodeURIComponent(ss.id)}`;
  if (!isScored(ss.type)) {
    const review = ss.review?.workOn?.trim();
    return APL.SessionRow({
      href,
      when: listWhen(ss),
      type: typeLabel(ss),
      summary: formSummary(ss) || '—',
      note: review ? `Improve: ${review}` : null,
      fk: `session-${ss.id}`,
    });
  }
  const st = computeStats(ss.ends);
  return APL.SessionRow({
    href,
    when: listWhen(ss),
    type: typeLabel(ss),
    summary: scoredSummary(ss),
    score: { total: st.total, max: st.max },
    stats: [
      ['M', fmt(st.avgM)],
      ['S', fmt(st.avgS)],
      ['Program', st.programPct == null ? '–' : `${st.programPct}%`],
    ],
    fk: `session-${ss.id}`,
  });
}

function renderList(ctx) {
  const sessions = ctx.finished.list();
  const binned = ctx.finished.deleted().length;
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: T.trainingLog,
        trailing: h('span', { class: 'apl-cap13 apl-header-count' }, `${sessions.length} sessions`),
      }),
      h(
        'div',
        { class: 'apl-screen-body' },
        sessions.length ? null : h('p', { class: 'apl-cap13' }, T.noSessions),
        sessions.length
          ? h(
              'ul',
              { class: 'apl-list plain-list' },
              sessions.map((ss) => h('li', null, sessionRow(ss))),
            )
          : null,
        binned
          ? APL.NavRow({
              href: '#/history/deleted',
              icon: icons.trash(),
              title: 'Recently deleted',
              detail: `${binned} ${binned === 1 ? 'session' : 'sessions'}`,
              fk: 'trash-link',
            })
          : null,
        competitionLogCard(ctx),
      ),
    ),
  };
}

/**
 * Top of a session's page: the screen header (back to the log, the session type as the title), then
 * the date / time and, for scored sessions, the setup line.
 */
function detailHeader(ctx, ss, detail) {
  return [
    APL.ScreenHeader({
      title: `${typeLabel(ss)} session`,
      onBack: () => ctx.navigate('history'),
      backLabel: T.backToLog,
    }),
    h(
      'div',
      { class: 'apl-detail-when' },
      h(
        'span',
        { class: 'apl-t' },
        formatDate(ss.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        ss.time ? ` · ${ss.time}` : '',
      ),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
  ];
}

/** The review of a form session: read, or written after Edit (one session's review open at a time). */
function formReview(ctx, ss) {
  const ov = ctx.ui.get().ov;
  const editing = ov?.id === ss.id && !!ov.review;
  return reviewSection(ctx, ss, { editing, onToggle: () => ctx.ui.set({ ov: { id: ss.id, review: !editing } }) });
}

/** Strength / mental session: its form (editable, saved as you go), the review and delete. */
function renderFormDetail(ctx, ss) {
  const change = (update, { rerender = true } = {}) => {
    if (ctx.finished.change(ss.id, update).status === 'saved' && rerender) ctx.rerender();
  };
  const [header, when] = detailHeader(ctx, ss, null);
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        when,
        card({ class: 'apl-card apl-form-card' }, formSections(ss.type, ss, change)),
        whenCard(ctx, ss),
        ss.type === 'mental' || ss.type === 'strength' ? null : gearCard(ctx, ss, finishedGear(ctx, ss)),
        formReview(ctx, ss),
        deleteButton(ctx, ss),
      ),
    ),
  };
}

function renderDetail(ctx, ss, mode) {
  if (!isScored(ss.type)) return renderFormDetail(ctx, ss);
  return renderOverview(ctx, ss, { mode });
}

/** The equipment picker's choice, stored on the finished session (the page is drawn again when it changed). */
const finishedGear = (ctx, ss) => (choice) => {
  if (ctx.finished.setGear(ss.id, choice).status === 'saved') ctx.rerender();
};

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
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Recently deleted', onBack: () => ctx.navigate('history'), backLabel: 'Back to history' }),
      h(
        'div',
        { class: 'apl-screen-body' },
        h('p', { class: 'apl-cap13' }, `Deleted sessions are kept here for ${TRASH_DAYS} days, then removed for good.`),
        items.length ? null : h('p', { class: 'apl-cap13' }, 'Nothing here.'),
        items.length
          ? h(
              'ul',
              { class: 'apl-list plain-list' },
              items.map(({ session: ss, daysLeft }) =>
                h(
                  'li',
                  null,
                  APL.SessionRow({
                    when: listWhen(ss),
                    type: typeLabel(ss),
                    summary: summary(ss),
                    foot: left(daysLeft),
                    actions: [
                      APL.Button({ children: 'Restore', variant: 'secondary', onClick: () => restore(ss), fk: `restore-${ss.id}` }),
                      h(
                        'button',
                        { type: 'button', class: 'btn btn-text danger', onClick: () => purge(ss), dataset: { fk: `purge-${ss.id}` } },
                        'Delete now',
                      ),
                    ],
                  }),
                ),
              ),
            )
          : null,
      ),
    ),
  };
}

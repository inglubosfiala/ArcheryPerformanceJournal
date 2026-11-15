// Sights tab: sight marks per distance + competition log (HANDOFF §8), drawn with the APL components.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { T } from '../strings.js';
import { card } from './common.js';

const isBlank = (m) => !(m.distance.trim() || m.elevation.trim() || m.windage.trim() || m.note.trim());

export function renderSights(ctx) {
  const ui = ctx.ui.get();
  const keep = ui.newSightIds || [];
  const focusId = ui.focusSight;
  if (focusId) ctx.ui.quietSet({ focusSight: null });
  // Empty rows are not kept, except ones added in this visit.
  for (const m of ctx.repo.list('sightMarks')) if (isBlank(m) && !keep.includes(m.id)) ctx.remove('sightMarks', m.id);
  const marks = ctx.repo.list('sightMarks', {
    sort: (a, b) => sortKey(a) - sortKey(b) || a.createdAt.localeCompare(b.createdAt),
  });

  const onSight = (id, key) => (e) => {
    const m = ctx.repo.get('sightMarks', id);
    if (m) ctx.save('sightMarks', { ...m, [key]: e.target.value });
  };

  const addRow = () => {
    const saved = ctx.save('sightMarks', { distance: '', elevation: '', windage: '', note: '' });
    if (saved) {
      ctx.ui.quietSet({ newSightIds: [...keep, saved.id], focusSight: saved.id });
      ctx.rerender();
    }
  };

  // New competitions are logged as Competition sessions; entries from the old list stay visible here.
  const comps = ctx.repo.list('competitions', {
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt),
  });

  const deleteComp = async (c) => {
    const ok = await confirmDialog({
      title: 'Delete competition?',
      message: T.confirmDeleteComp(c.event || 'this competition'),
      confirmLabel: T.delete,
      danger: true,
    });
    if (!ok) return;
    ctx.remove('competitions', c.id);
    ctx.rerender();
  };

  // one row per mark; the column header says what each field is, screen readers hear it per field
  const markRow = (m, i) => {
    const name = m.distance || `row ${i + 1}`;
    const field = (key, label) =>
      APL.TextField({ label, hideLabel: true, value: m[key], fk: `sight-${m.id}-${key}`, onInput: onSight(m.id, key) });
    const row = h(
      'div',
      { class: 'sight-grid' },
      field('distance', `Distance, row ${i + 1}`),
      field('elevation', `Elevation for ${name}`),
      field('windage', `Windage for ${name}`),
      field('note', `Note for ${name}`),
    );
    if (focusId === m.id) queueMicrotask(() => row.querySelector('input')?.focus());
    return row;
  };

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: T.sightMarks }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        card(
          { class: 'apl-card sight-card' },
          h(
            'div',
            { class: 'sight-grid sight-head', 'aria-hidden': 'true' },
            h('span', null, 'Dist.'),
            h('span', null, 'Elevation'),
            h('span', null, 'Windage'),
            h('span', null, 'Note'),
          ),
          marks.map(markRow),
          APL.AddButton({ children: T.addDistance, onClick: addRow, fk: 'add-distance' }),
          h('p', { class: 'apl-cap' }, 'Clear every field of a row to remove it.'),
        ),
        comps.length
          ? card(
              { class: 'apl-card' },
              APL.Section({
                label: T.competitionLog,
                id: 'comps',
                children: [
                  h(
                    'p',
                    { class: 'apl-cap13' },
                    'Earlier entries. New competitions are logged as Competition sessions (Dashboard → New session).',
                  ),
                  h(
                    'ul',
                    { class: 'apl-list plain-list' },
                    comps.map((c) =>
                      h(
                        'li',
                        null,
                        APL.SessionRow({
                          when: c.event || 'Competition',
                          summary: [c.date ? formatDate(c.date) : '', c.round].filter(Boolean).join(' · ') || '—',
                          score: { total: c.score || '—' },
                          foot: [`Sight ${c.sightMark || '—'}`, c.conditions, c.note].filter(Boolean).join(' · '),
                          actions: h(
                            'button',
                            {
                              type: 'button',
                              class: 'btn btn-text danger',
                              'aria-label': `${T.delete} ${c.event || 'competition'}`,
                              onClick: () => deleteComp(c),
                            },
                            T.delete,
                          ),
                        }),
                      ),
                    ),
                  ),
                ],
              }),
            )
          : null,
      ),
    ),
  };
}

function sortKey(m) {
  const n = parseInt(m.distance, 10);
  return Number.isFinite(n) ? n : 9999;
}

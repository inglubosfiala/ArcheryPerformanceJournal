// Dashboard: the start page and gate to the app's features (history, insights, equipment, sight
// marks, grading guide, settings). New session and running sessions sit at the bottom, above the
// tab bar (renderRunning in main.js), within thumb reach.
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import { card } from './common.js';
import { newestFirst } from '../sessionTypes.js';

const lastFinished = (repo) =>
  repo.list('sessions', {
    filter: (x) => x.status === 'finished',
    sort: newestFirst,
  });

export function renderDashboard(ctx) {
  const finished = lastFinished(ctx.repo);

  // --- feature tiles
  const tile = (props, icon, title, sub) =>
    h(
      props.href ? 'a' : 'button',
      { class: 'hub-tile', ...(props.href ? {} : { type: 'button' }), ...props },
      icon(),
      h('span', { class: 'hub-tile-title' }, title),
      h('span', { class: 'hub-tile-sub muted' }, sub),
    );
  const tiles = card(
    { class: 'hub-card', 'aria-label': 'Sections' },
    h(
      'div',
      { class: 'hub-grid' },
      tile(
        { href: '#/history' },
        icons.history,
        'History',
        `${finished.length} ${finished.length === 1 ? 'session' : 'sessions'}`,
      ),
      tile({ href: '#/insights' }, icons.insights, 'Insights', 'Trends, reviews, training load'),
      tile({ href: '#/gear' }, icons.gear, 'Equipment', 'Bow setup & snapshots'),
      tile({ href: '#/sights' }, icons.sights, 'Sight marks', 'Marks & competitions'),
      tile({ onClick: () => ctx.ui.set({ guide: true }) }, icons.help, 'Grades', 'M / S grading guide'),
      tile(
        { href: '#/settings' },
        icons.settings,
        'Settings',
        ctx.sync?.signedIn() ? 'Synced to Google Drive' : 'Backup & sync',
      ),
    ),
  );

  return { content: h('div', { class: 'stack' }, tiles) };
}

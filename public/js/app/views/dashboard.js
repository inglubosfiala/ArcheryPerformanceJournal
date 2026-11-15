// Dashboard: the start page and gate to the app's features (history, insights, equipment, sight
// marks, grading guide, settings). New session and running sessions sit at the bottom, above the
// tab bar (renderRunning in main.js), within thumb reach.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';

export function renderDashboard(ctx) {
  const finished = ctx.finished.list();
  const row = (props) => APL.NavRow(props);

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: T.appTitle }),
      h(
        'div',
        { class: 'apl-screen-body' },
        h(
          'nav',
          { class: 'apl-list', 'aria-label': 'Sections' },
          row({
            href: '#/history',
            icon: icons.history(),
            title: 'History',
            detail: `${finished.length} ${finished.length === 1 ? 'session' : 'sessions'}`,
            fk: 'hub-history',
          }),
          row({ href: '#/insights', icon: icons.insights(), title: 'Insights', detail: 'Trends, reviews, training load', fk: 'hub-insights' }),
          row({ href: '#/gear', icon: icons.gear(), title: 'Equipment', detail: 'Bow setup and snapshots', fk: 'hub-gear' }),
          row({ href: '#/sights', icon: icons.sights(), title: 'Sight marks', detail: 'Marks and competitions', fk: 'hub-sights' }),
          row({
            onClick: () => ctx.ui.set({ guide: true }),
            icon: icons.help(),
            title: 'Grades',
            detail: 'M / S grading guide',
            fk: 'hub-grades',
          }),
          row({
            href: '#/settings',
            icon: icons.settings(),
            title: 'Settings',
            detail: ctx.sync?.signedIn() ? 'Synced to Google Drive' : 'Backup and sync',
            fk: 'hub-settings',
          }),
        ),
      ),
    ),
  };
}

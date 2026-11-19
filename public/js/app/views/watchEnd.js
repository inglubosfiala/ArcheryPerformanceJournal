// What the watch recorded through one end: a timeline chart (heart rate, each shot as a numbered
// marker coloured by its M grade, the seconds between shots), the end's figures and its arrows in
// the order shot. Shown after the Watch scan (OK goes on to scoring) and from History.
import { h, s } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { icons } from '../icons.js';
import { endTimeline, mmss } from '../hrTrace.js';

const VB_W = 340;
const VB_H = 172;
const L = 36; // left: heart-rate labels
const R = 330;
const T = 30; // top: shot numbers above
const B = 114; // bottom of the plot; time labels and gaps below

/** "good" (M 4-5), "mid" (M 3), "low" (M 1-2) or "none". */
export function mTone(m) {
  if (m == null) return 'none';
  return m >= 4 ? 'good' : m === 3 ? 'mid' : 'low';
}

function tickStep(seconds) {
  if (seconds <= 90) return 15;
  if (seconds <= 240) return 30;
  if (seconds <= 600) return 60;
  return 120;
}

/** The timeline chart of an end (SVG), or null when the watch recorded nothing for it. */
export function timelineChart(tl, { hrTrace = null } = {}) {
  if (!tl) return null;
  const seconds = Math.max(1, tl.seconds);
  const x = (t) => L + (Math.min(t, seconds) / seconds) * (R - L);
  const parts = [];

  // heart rate: area and line, the range at the left
  let y = null;
  if (hrTrace?.hr?.length && tl.hr) {
    let lo = tl.hr.min;
    let hi = tl.hr.max;
    if (hi - lo < 10) {
      const mid = (hi + lo) / 2;
      lo = mid - 5;
      hi = mid + 5;
    }
    y = (v) => T + ((hi - v) / (hi - lo)) * (B - T);
    const pts = hrTrace.hr.map((v, i) => [x(i * hrTrace.step + hrTrace.step / 2), y(v)]);
    const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    parts.push(s('polygon', { class: 'wt-area', points: `${pts[0][0].toFixed(1)},${B} ${line} ${pts[pts.length - 1][0].toFixed(1)},${B}` }));
    parts.push(s('polyline', { class: 'wt-line', points: line }));
    parts.push(s('text', { class: 'wt-axis', x: L - 4, y: y(tl.hr.max) + 4, 'text-anchor': 'end' }, `♥${tl.hr.max}`));
    parts.push(s('text', { class: 'wt-axis', x: L - 4, y: y(tl.hr.min) + 4, 'text-anchor': 'end' }, `${tl.hr.min}`));
  }

  // time axis
  parts.push(s('line', { class: 'wt-base', x1: L, x2: R, y1: B, y2: B }));
  const step = tickStep(seconds);
  for (let t = 0; t <= seconds + 0.1; t += step) {
    parts.push(s('line', { class: 'wt-tick', x1: x(t), x2: x(t), y1: B, y2: B + 4 }));
    parts.push(s('text', { class: 'wt-axis', x: x(t), y: B + 15, 'text-anchor': 'middle' }, mmss(t)));
  }

  // shots: a line through the plot, a marker (on the curve when there is one), the arrow number
  // above; between two shots the seconds that passed
  tl.shots.forEach((sh, i) => {
    const sx = x(sh.t);
    const tone = mTone(sh.m);
    parts.push(s('line', { class: `wt-shot is-${tone}`, x1: sx, x2: sx, y1: T - 6, y2: B }));
    const my = y && sh.hr != null ? y(sh.hr) : B - 8;
    parts.push(s('circle', { class: `wt-dot is-${tone}`, cx: sx, cy: my, r: 4.5 }));
    parts.push(s('text', { class: `wt-no is-${tone}`, x: sx, y: T - 10, 'text-anchor': 'middle' }, sh.no != null ? `#${sh.no}` : '•'));
    if (sh.gap != null) {
      const px = x(tl.shots[i - 1].t);
      if (sx - px >= 22) {
        parts.push(s('line', { class: 'wt-gapline', x1: px + 3, x2: sx - 3, y1: B + 26, y2: B + 26 }));
        parts.push(s('text', { class: 'wt-gap', x: (px + sx) / 2, y: B + 40, 'text-anchor': 'middle' }, `${Math.round(sh.gap)} s`));
      }
    }
  });

  return s('svg', { class: 'wt-chart', viewBox: `0 0 ${VB_W} ${VB_H}`, role: 'img', 'aria-label': timelineLabel(tl) }, ...parts);
}

function timelineLabel(tl) {
  const shots = tl.shots.map((sh) => `arrow ${sh.no ?? '?'} at ${mmss(sh.t)}${sh.m != null ? `, M${sh.m}` : ''}${sh.hr != null ? `, heart rate ${sh.hr}` : ''}`);
  return `End timeline, ${mmss(tl.seconds)}${tl.hr ? `, heart rate ${tl.hr.min} to ${tl.hr.max}` : ''}. ${shots.join('; ')}`;
}

/** The figures and the arrows in the order shot, under the chart. */
function timelineDetails(tl) {
  const tile = (label, value) => h('div', { class: 'wt-tile' }, h('span', { class: 'wt-tile-label' }, label), h('strong', null, value));
  const tiles = h(
    'div',
    { class: 'wt-tiles' },
    tile('Length', mmss(tl.seconds)),
    tile('Shots', String(tl.shots.length)),
    tile('Rhythm', tl.avgGap != null ? `Ø ${tl.avgGap} s` : '–'),
    tile('Heart rate', tl.hr ? `${tl.hr.min}–${tl.hr.max}` : '–'),
  );
  const rows = tl.shots.length
    ? h(
        'table',
        { class: 'wt-table' },
        h('thead', null, h('tr', null, ...['Arrow', 'Time', 'Gap', 'M', 'S', '♥', 'Score'].map((c) => h('th', { scope: 'col' }, c)))),
        h(
          'tbody',
          null,
          tl.shots.map((sh) =>
            h(
              'tr',
              null,
              h('td', null, h('span', { class: `wt-badge is-${mTone(sh.m)}` }, sh.no != null ? `#${sh.no}` : '–')),
              h('td', null, mmss(sh.t)),
              h('td', null, sh.gap != null ? `+${Math.round(sh.gap)} s` : '–'),
              h('td', null, sh.m ?? '–'),
              h('td', null, sh.s ?? '–'),
              h('td', null, sh.hr ?? '–'),
              h('td', null, sh.v ?? '–'),
            ),
          ),
        ),
      )
    : h('p', { class: 'wt-empty' }, 'No arrows were graded on the watch in this end; its heart rate is kept.');
  return h('div', { class: 'wt-details' }, tiles, rows);
}

/**
 * The end's timeline as a dialog with OK. Resolves when closed. Nothing (resolves at once) when
 * the end has nothing from the watch.
 */
export function showWatchEnd(end, { title }) {
  const tl = endTimeline(end);
  if (!tl) return Promise.resolve();
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const okBtn = APL.Button({ children: 'OK', onClick: () => close(), fk: 'watch-end-ok' });
    const dialog = APL.Dialog({
      title,
      icon: icons.watch(),
      body: h('div', { class: 'wt' }, timelineChart(tl, { hrTrace: end.hrTrace }), timelineDetails(tl)),
      idPrefix: 'watch-end',
      actions: [okBtn],
    });
    dialog.classList.add('wt-dialog');

    function close() {
      dialog.classList.add('is-out');
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => dialog.close(), reduce ? 0 : 140);
    }
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve();
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}

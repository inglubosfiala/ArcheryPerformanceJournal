// APL components (design/apl/), rebuilt for this app's vanilla DOM: each one is a function that takes
// the design system's props (design/apl/components/index.d.ts) and returns an element styled by
// css/apl.css. They hold no state: the page is drawn again when a value changes.
//
// Beyond the design system's props, interactive components take `fk`, the focus key the app uses
// to give focus back to the same control after it redraws the page (main.js, renderNow).
import { h, s } from '../../core/dom.js';

/** @typedef {'back'|'repeat'|'calendar'|'clock'|'plus'|'arrowRight'|'target'|'bow'} IconName */
/** @typedef {'full'|'six'|'triple'|'vegas'} FaceKind */
/** @typedef {{value: string|number, label: string}} Option */
/** @typedef {Node|string|number|null|undefined|false} Child */

const fkData = (fk) => (fk ? { fk } : undefined);

const PATHS = {
  back: [['path', { d: 'M15 18l-6-6 6-6' }]],
  repeat: [
    ['path', { d: 'M3 12a9 9 0 1 0 3-6.7' }],
    ['path', { d: 'M3 4v5h5' }],
  ],
  calendar: [
    ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'M16 3v4M8 3v4M3 10h18' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  arrowRight: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  target: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['circle', { cx: 12, cy: 12, r: 5 }],
    ['circle', { cx: 12, cy: 12, r: 1 }],
  ],
  bow: [
    ['path', { d: 'M6 3c6 3 6 15 0 18' }],
    ['path', { d: 'M6 3v18' }],
    ['path', { d: 'M3 12h17M17 9l3 3-3 3' }],
  ],
};

/** Inline 24-unit stroke icon, `currentColor`, hidden from assistive technology. */
export function Icon({ name, size = 20, strokeWidth = 2 }) {
  return s(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    (PATHS[name] || []).map(([tag, attrs]) => s(tag, attrs)),
  );
}

/** Full-width 56px action. One primary per screen, in the BottomBar. */
export function Button({
  children,
  variant = 'primary',
  trailingIcon,
  disabled = false,
  type = 'button',
  onClick,
  fk,
}) {
  return h(
    'button',
    {
      type,
      class: ['apl', 'apl-btn', variant === 'secondary' && 'apl-btn--secondary'],
      disabled,
      onClick,
      dataset: fkData(fk),
    },
    children,
    trailingIcon ? Icon({ name: trailingIcon, strokeWidth: 2.2 }) : null,
  );
}

/** Round 44px icon-only button; `label` becomes its aria-label. */
export function IconButton({ icon, label, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-iconbtn', 'aria-label': label, onClick, dataset: fkData(fk) },
    Icon({ name: icon, size: 22 }),
  );
}

/** Back button (when `onBack` is given) and the screen title, on ground. */
export function ScreenHeader({ title, onBack, trailing = null, backLabel = 'Back' }) {
  return h(
    'header',
    { class: 'apl apl-header' },
    onBack ? IconButton({ icon: 'back', label: backLabel, onClick: onBack, fk: 'screen-back' }) : null,
    h('h1', null, title),
    trailing,
  );
}

/** UPPERCASE label with an optional right-aligned accessory, then the content. */
export function Section({ label, accessory = null, children = [], id }) {
  const labelId = id ? `${id}-label` : undefined;
  return h(
    'section',
    { class: 'apl apl-section', 'aria-labelledby': labelId },
    h('div', { class: 'apl-section-head' }, h('h2', { class: 'apl-label', id: labelId }, label), accessory),
    children,
  );
}

/** 48px toggle button (52px `numeric`); aria-pressed carries the selection. */
export function Chip({ children, selected = false, numeric = false, onClick, fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['apl', 'apl-chip', numeric && 'apl-chip--num'],
      'aria-pressed': String(!!selected),
      onClick,
      dataset: fkData(fk),
    },
    children,
  );
}

/** Single-choice grid of Chips. `fk` is a prefix: each chip gets `${fk}-${value}`. */
export function ChipGrid({ label, options, value, onChange, columns = 4, numeric = false, fk }) {
  return h(
    'div',
    {
      class: 'apl apl-chipgrid',
      role: 'group',
      'aria-label': label,
      style: { '--apl-cols': String(columns) },
    },
    options.map((o) =>
      Chip({
        numeric,
        selected: o.value === value,
        onClick: () => onChange?.(o.value),
        fk: fk && `${fk}-${o.value}`,
        children: o.label,
      }),
    ),
  );
}

/** Wrapping 44px pills for longer labels; show only the options valid here. */
export function OptionPills({ label, options, value, onChange, fk }) {
  return h(
    'div',
    { class: 'apl apl-pills', role: 'group', 'aria-label': label },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: 'apl-pill',
          'aria-pressed': String(o.value === value),
          onClick: () => onChange?.(o.value),
          dataset: fkData(fk && `${fk}-${o.value}`),
        },
        o.label,
      ),
    ),
  );
}

/** A track of 2–5 equal 44px segments; the selected one fills accent. */
export function SegmentedControl({ label, options, value, onChange, fk }) {
  return h(
    'div',
    {
      class: 'apl apl-seg',
      role: 'group',
      'aria-label': label,
      style: { '--apl-cols': String(options.length) },
    },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(o.value === value),
          onClick: () => onChange?.(o.value),
          dataset: fkData(fk && `${fk}-${o.value}`),
        },
        o.label,
      ),
    ),
  );
}

/**
 * Compact − value + pill. Clamps to `min` / `max` and disables the end buttons there.
 * `display` (optional) is the text shown instead of `value unit`.
 */
export function Stepper({
  value,
  onChange,
  label = '',
  unit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  display,
  fk,
}) {
  const set = (v) => onChange?.(Math.max(min, Math.min(max, v)));
  return h(
    'div',
    { class: 'apl apl-stepper', role: 'group', 'aria-label': label || undefined },
    h(
      'button',
      {
        type: 'button',
        'aria-label': `Decrease ${label}`.trim(),
        disabled: value <= min,
        onClick: () => set(value - step),
        dataset: fkData(fk && `${fk}-minus`),
      },
      '−',
    ),
    h('output', { 'aria-live': 'polite' }, display ?? `${value}${unit ? ` ${unit}` : ''}`),
    h(
      'button',
      {
        type: 'button',
        'aria-label': `Increase ${label}`.trim(),
        disabled: value >= max,
        onClick: () => set(value + step),
        dataset: fkData(fk && `${fk}-plus`),
      },
      '+',
    ),
  );
}

/** 12px pill: accent flags a smart default ("Suggested"); neutral for plain tags. Never errors. */
export function Badge({ children, tone = 'accent' }) {
  return h('span', { class: ['apl', 'apl-badge', tone === 'neutral' && 'apl-badge--neutral'] }, children);
}

/** Accent-tint card that fills a form with the last-used values in one tap. */
export function RepeatCard({ title, summary, actionLabel = 'Use', icon = 'repeat', onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-repeat', onClick, dataset: fkData(fk) },
    h('span', { class: 'apl-well' }, Icon({ name: icon })),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      h('span', { class: 'apl-cap13' }, summary),
    ),
    h('span', { class: 'apl-link' }, actionLabel),
  );
}

/** 56px field showing a value and hint with a leading icon; tapping opens a picker. */
export function FieldButton({ value, hint, icon, onClick, fk, attrs = {} }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-field', onClick, dataset: fkData(fk), ...attrs },
    icon ? Icon({ name: icon }) : null,
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, value),
      hint ? h('span', { class: 'apl-cap' }, hint) : null,
    ),
  );
}

/** 60px radio-style card for saved items (equipment). */
export function SelectCard({ title, detail, selected = false, onClick, fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'apl apl-select',
      'aria-pressed': String(!!selected),
      onClick,
      dataset: fkData(fk),
    },
    h('span', { class: 'apl-radio' }, h('i')),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
  );
}

/** Dashed "Add …" button that ends a list of SelectCards. */
export function AddButton({ children, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-add', onClick, dataset: fkData(fk) },
    Icon({ name: 'plus', size: 18 }),
    children,
  );
}

export const FACE_NAMES = {
  full: 'Full face',
  six: '10–6 rings',
  triple: 'Triple vertical',
  vegas: 'Vegas 3-spot',
};
export const FACE_HINTS = {
  full: 'All 10 rings',
  six: 'Rings 6–10 only',
  triple: 'Three 10–6 spots, one arrow each',
  vegas: 'Triangle of three 10–6 spots',
};

function spot(cx, cy, r) {
  return [
    s('circle', { class: 'blue', cx, cy, r }),
    s('circle', { class: 'red', cx, cy, r: r * 0.62 }),
    s('circle', { class: 'gold', cx, cy, r: r * 0.3 }),
  ];
}

/** Target face illustration in target-* colours. */
export function TargetFace({ kind = 'full', size = 84 }) {
  let kids = [];
  if (kind === 'full') {
    const cls = ['wht', 'wht', 'blk', 'blk', 'blue', 'blue', 'red', 'red', 'gold', 'gold'];
    kids = cls.map((c, i) =>
      s('circle', { class: `${c} ${c === 'blk' ? 'sepw' : 'sep'}`, cx: 50, cy: 50, r: 49 - i * 5 }),
    );
  } else if (kind === 'six') {
    kids = [
      ['blue', 49],
      ['red', 39],
      ['red', 29],
      ['gold', 19],
      ['gold', 9],
    ].map(([c, r]) => s('circle', { class: `${c} sep`, cx: 50, cy: 50, r }));
  } else if (kind === 'triple') {
    kids = [...spot(50, 17, 16), ...spot(50, 50, 16), ...spot(50, 83, 16)];
  } else {
    kids = [...spot(29, 30, 20), ...spot(71, 30, 20), ...spot(50, 70, 20)];
  }
  return s(
    'svg',
    {
      class: 'apl-face',
      width: size,
      height: size,
      viewBox: '0 0 100 100',
      role: 'img',
      'aria-label': FACE_NAMES[kind],
    },
    kids,
  );
}

/** Live preview of the chosen face: illustration, size, type and hint. */
export function FaceCard({ size, kind }) {
  return h(
    'div',
    { class: 'apl apl-facecard' },
    h('div', { class: 'apl-facebox' }, TargetFace({ kind })),
    h(
      'div',
      { class: 'apl-stack' },
      h('span', { class: 'apl-big' }, `${size} cm`),
      h('span', { class: 'apl-soft' }, FACE_NAMES[kind]),
      h('span', { class: 'apl-cap' }, FACE_HINTS[kind]),
    ),
  );
}

/** Pinned footer: an optional one-line summary and the screen's primary Button. */
export function BottomBar({ summary, children = [] }) {
  return h(
    'footer',
    { class: 'apl apl-bar' },
    summary ? h('span', { class: 'apl-cap13', 'aria-live': 'polite' }, summary) : null,
    children,
  );
}

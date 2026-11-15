// Forms of the non-scored session types (strength, mental). The same fields are used to create a
// session (New session page) and to edit a saved one (History detail).
import { h } from '../../core/dom.js';
import { DRILLS, drillLabel, emptyDrill, MENTAL_TECHNIQUES, EFFORT_MAX, FOCUS_MAX } from '../sessionTypes.js';
import { tabataTimer } from './tabataTimer.js';
import { icons } from '../icons.js';
import { chip, sectionLabel } from './common.js';

/** Empty strength / mental session fields. */
export function emptyForm(type) {
  if (type === 'blank') return { arrows: null, minutes: null, note: '' };
  if (type === 'manual') return { arrows: null, minutes: null, note: '' };
  return type === 'strength'
    ? { minutes: null, effort: null, drills: [], note: '' }
    : { minutes: null, focus: null, techniques: [] };
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Sections of the form. `value` holds the fields as rendered. `change(update, { rerender })` stores a
 * change: `update(current) → patch` runs on the current fields (not the rendered ones), so typing that
 * was stored without re-rendering is never overwritten by a later tap. Typing does not re-render (the
 * field keeps focus); taps do.
 * `live`: the session is being shot now (New session page with a running timer) — a blank bale count
 * is then tapped up with big +1 / +3 / +6 buttons instead of typed. Editing a saved one keeps the field.
 * `timer`: the session timer, shown on the count's row (right of it).
 */
export function formSections(type, value, change, { live = false, timer = null } = {}) {
  const numberField = (label, key, fk, { suffix = '' } = {}) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h(
        'div',
        { class: 'input-suffix' },
        h('input', {
          class: 'input',
          type: 'number',
          inputmode: 'numeric',
          min: 0,
          value: value[key] ?? '',
          dataset: { fk },
          onInput: (e) => change(() => ({ [key]: toInt(e.target.value) }), { rerender: false }),
        }),
        suffix ? h('span', { class: 'muted small' }, suffix) : null,
      ),
    );

  const scale = (label, key, max, fk) =>
    h(
      'section',
      { class: 'setup-section', 'aria-label': label },
      sectionLabel(label),
      h(
        'div',
        { class: 'grid-5' },
        Array.from({ length: max }, (_, i) => i + 1).map((n) =>
          chip({
            label: String(n),
            pressed: value[key] === n,
            fk: `${fk}-${n}`,
            // tapping the chosen value again clears it
            onClick: () => change((cur) => ({ [key]: cur[key] === n ? null : n })),
          }),
        ),
      ),
    );

  const noteField = (placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, 'Note'),
      h('textarea', {
        rows: 3,
        class: 'review-text',
        value: value.note || '',
        placeholder,
        dataset: { fk: 'form-note' },
        onInput: (e) => change(() => ({ note: e.target.value }), { rerender: false }),
      }),
    );

  if (type === 'blank') {
    // The count is a big number, changed with −1 / +1 / +3 / +6; tapping the number lets you type it
    // (a total from memory, or a larger correction). Changes do not re-render the page: the number
    // is updated in place and pops, and a floating "+n" rises from it.
    // Shot now (`live`): the timer sits beside the count; duration and note are asked on Save (log.js).
    // Logged afterwards or edited in History: Duration and Note fields follow.
    const count = h(
      'button',
      {
        type: 'button',
        class: 'arrow-count',
        'aria-label': `${value.arrows || 0} arrows shot. Tap to type the number`,
        dataset: { fk: 'arrows-count' },
        onClick: () => editCount(),
      },
      String(value.arrows || 0),
    );
    // no visible unit (the big number is self-explanatory); screen readers still hear "arrows"
    const status = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const countBox = h('div', { class: 'arrow-count-box' }, count, status);
    const replay = (el, cls) => {
      el.classList.remove(cls);
      void el.offsetWidth; // restart the animation on quick repeated taps
      el.classList.add(cls);
    };
    let minusBtn;
    const show = (n) => {
      count.textContent = String(n);
      count.setAttribute('aria-label', `${n} arrows shot. Tap to type the number`);
      status.textContent = `${n} arrows`;
      minusBtn.disabled = n === 0;
    };
    const add = (n, btn) => {
      let next = 0;
      let applied = 0;
      change(
        (cur) => {
          next = Math.max(0, (cur.arrows || 0) + n);
          applied = next - (cur.arrows || 0);
          return { arrows: next };
        },
        { rerender: false },
      );
      show(next);
      if (!applied) return;
      replay(count, applied > 0 ? 'is-bumped' : 'is-dropped');
      replay(btn, applied > 0 ? 'is-flashed' : 'is-flashed-minus');
      const fly = h('span', { class: ['arrow-count-fly', applied < 0 && 'is-minus'], 'aria-hidden': 'true' }, applied > 0 ? `+${applied}` : `−${-applied}`);
      fly.addEventListener('animationend', () => fly.remove());
      countBox.append(fly);
      if (navigator.vibrate) navigator.vibrate(15);
    };
    // the number turns into a field; Enter or leaving it keeps the typed value, Escape keeps the old one
    function editCount() {
      const input = h('input', {
        class: 'input arrow-count-input',
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        value: count.textContent,
        'aria-label': 'Arrows shot',
        dataset: { fk: 'arrows-count-input' },
      });
      let done = false;
      const finish = (keep) => {
        if (done) return;
        done = true;
        const n = toInt(input.value);
        if (keep && n != null) {
          change(() => ({ arrows: n }), { rerender: false });
          show(n);
        }
        input.replaceWith(count);
        count.focus({ preventScroll: true });
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true));
      count.replaceWith(input);
      input.focus();
      input.select();
    }
    minusBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-outline arrow-add-btn arrow-minus-btn',
        'aria-label': 'Remove 1 arrow',
        disabled: !value.arrows,
        dataset: { fk: 'arrows-minus-1' },
        onClick: (e) => add(-1, e.currentTarget),
      },
      '−1',
    );
    const counter = h(
      'section',
      { class: 'setup-section arrow-counter', 'aria-label': 'Arrows shot' },
      timer ? h('div', { class: 'arrow-count-row' }, countBox, timer) : [sectionLabel('Arrows shot'), countBox],
      h(
        'div',
        { class: 'arrow-add-row' },
        minusBtn,
        [1, 3, 6].map((n) =>
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-outline arrow-add-btn',
              'aria-label': `Add ${n} ${n === 1 ? 'arrow' : 'arrows'}`,
              dataset: { fk: `arrows-add-${n}` },
              onClick: (e) => add(n, e.currentTarget),
            },
            `+${n}`,
          ),
        ),
      ),
    );
    return live
      ? [counter]
      : [counter, numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }), noteField('…')];
  }

  if (type === 'manual') {
    // typed in afterwards (the date and time are set in the When section): arrows and / or duration
    return [
      h(
        'div',
        { class: 'grid-2' },
        numberField('Arrows shot', 'arrows', 'arrows'),
        numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      ),
      noteField('…'),
    ];
  }

  if (type === 'strength') {
    const drills = value.drills || [];
    const setDrill = (i, patch, opts) =>
      change(
        (cur) => ({ drills: (cur.drills || []).map((d, j) => (j === i ? { ...d, ...patch } : d)) }),
        opts,
      );
    const drillInput = (i, d, key, label) =>
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, label),
        h('input', {
          class: 'input',
          type: 'number',
          inputmode: 'numeric',
          min: 0,
          value: d[key] ?? '',
          dataset: { fk: `drill-${i}-${key}` },
          onInput: (e) => setDrill(i, { [key]: toInt(e.target.value) }, { rerender: false }),
        }),
      );
    return [
      h(
        'section',
        { class: 'setup-section', 'aria-label': 'Drills' },
        sectionLabel('Drills'),
        drills.map((d, i) => {
          const hold = DRILLS.find((x) => x.id === d.kind)?.hold;
          return h(
            'div',
            { class: 'drill-row' },
            h(
              'div',
              { class: 'spread align-center' },
              h('strong', null, drillLabel(d.kind)),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `Remove ${drillLabel(d.kind)}`,
                  onClick: () => change((cur) => ({ drills: (cur.drills || []).filter((_, j) => j !== i) })),
                },
                icons.close(),
              ),
            ),
            h(
              'div',
              { class: hold ? 'grid-4' : 'grid-2' },
              drillInput(i, d, 'sets', 'Sets'),
              drillInput(i, d, 'reps', 'Reps'),
              hold ? drillInput(i, d, 'holdSec', 'Hold (s)') : null,
              hold ? drillInput(i, d, 'restSec', 'Rest (s)') : null,
            ),
            // a drill with a hold can be run on the interval timer: it counts the holds and rests
            // typed in above (read when it starts, so what was just typed counts)
            hold
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-outline drill-timer-btn',
                    dataset: { fk: `drill-${i}-timer` },
                    onClick: () => {
                      let now = d;
                      change(
                        (cur) => {
                          now = (cur.drills || [])[i] || d;
                          return {};
                        },
                        { rerender: false },
                      );
                      tabataTimer({ title: drillLabel(now.kind), work: now.holdSec, rest: now.restSec ?? 0, reps: now.reps, sets: now.sets });
                    },
                  },
                  icons.play(),
                  'Start timer',
                )
              : null,
          );
        }),
        h(
          'div',
          { class: 'grid-3' },
          DRILLS.filter((d) => !d.retired).map((d) =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-dashed btn-sm',
                dataset: { fk: `add-${d.id}` },
                onClick: () => change((cur) => ({ drills: [...(cur.drills || []), emptyDrill(d.id)] })),
              },
              `+ ${d.label}`,
            ),
          ),
        ),
      ),
      // while the session runs the timer is the duration (as on the blank bale page); it can be
      // changed on the saved session
      live ? null : numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      scale(`Effort (1–${EFFORT_MAX})`, 'effort', EFFORT_MAX, 'effort'),
      noteField('…'),
    ];
  }

  // mental
  const techniques = value.techniques || [];
  return [
    h(
      'section',
      { class: 'setup-section', 'aria-label': 'Techniques' },
      sectionLabel('What you practised'),
      h(
        'div',
        { class: 'grid-3' },
        MENTAL_TECHNIQUES.map((t) =>
          chip({
            label: t,
            pressed: techniques.includes(t),
            fk: `tech-${t}`,
            onClick: () =>
              change((cur) => {
                const list = cur.techniques || [];
                return { techniques: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
              }),
          }),
        ),
      ),
    ),
    numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
    scale(`Focus / quality (1 best – ${FOCUS_MAX})`, 'focus', FOCUS_MAX, 'focus'),
  ];
}

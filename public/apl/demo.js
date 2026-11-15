// One story per APL component, with live state (not part of the app; open apl/demo.html).
import { h } from '../js/core/dom.js';
import * as APL from '../js/ui/apl/index.js';

const state = {
  distance: 18,
  size: 40,
  kind: 'triple',
  arrows: 3,
  bow: 'recurve',
  count: 30,
  timerOn: true,
  techniques: ['Breathing'],
};
const KINDS = {
  40: ['full', 'six', 'triple', 'vegas'],
  60: ['full', 'six'],
  80: ['full', 'six'],
  122: ['full'],
};
const set = (patch) => {
  Object.assign(state, patch);
  render();
};

const story = (name, ...children) => h('section', { class: 'demo-story' }, h('h2', null, name), children);

function render() {
  const root = document.getElementById('demo');
  const focusKey = document.activeElement?.dataset?.fk;
  root.replaceChildren(
    APL.ScreenHeader({ title: 'APL components', onBack: () => history.back() }),
    story(
      'Icon',
      h(
        'div',
        { class: 'demo-row' },
        ['back', 'repeat', 'calendar', 'clock', 'plus', 'arrowRight', 'target', 'bow'].map((name) =>
          APL.Icon({ name }),
        ),
      ),
    ),
    story(
      'IconButton',
      h(
        'div',
        { class: 'demo-row' },
        APL.IconButton({ icon: 'back', label: 'Back' }),
        APL.IconButton({ icon: 'plus', label: 'Add' }),
      ),
    ),
    story(
      'Button',
      APL.Button({ children: 'Start session', trailingIcon: 'arrowRight' }),
      APL.Button({ children: 'Cancel', variant: 'secondary' }),
      APL.Button({ children: 'Disabled', disabled: true }),
    ),
    story(
      'Badge',
      h(
        'div',
        { class: 'demo-row' },
        APL.Badge({ children: 'Suggested for 18 m' }),
        APL.Badge({ children: 'Training', tone: 'neutral' }),
      ),
    ),
    story(
      'Section · ChipGrid · Stepper',
      APL.Section({
        label: 'Distance',
        id: 'demo-dist',
        accessory: APL.Stepper({
          label: 'distance',
          value: state.distance,
          unit: 'm',
          min: 5,
          max: 90,
          onChange: (distance) => set({ distance }),
          fk: 'd',
        }),
        children: APL.ChipGrid({
          label: 'Distance presets',
          value: state.distance,
          onChange: (distance) => set({ distance }),
          options: [7, 18, 25, 30, 50, 60, 70].map((d) => ({ value: d, label: `${d} m` })),
          fk: 'dist',
        }),
      }),
    ),
    story(
      'Chip (numeric)',
      APL.ChipGrid({
        label: 'Arrows per end',
        numeric: true,
        value: state.arrows,
        onChange: (arrows) => set({ arrows }),
        options: [3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })),
        fk: 'n',
      }),
    ),
    story(
      'FaceCard · SegmentedControl · OptionPills',
      APL.FaceCard({ size: state.size, kind: state.kind }),
      APL.SegmentedControl({
        label: 'Face size',
        value: state.size,
        onChange: (size) => set({ size, kind: KINDS[size].includes(state.kind) ? state.kind : 'full' }),
        options: [40, 60, 80, 122].map((v) => ({ value: v, label: `${v} cm` })),
        fk: 'size',
      }),
      APL.OptionPills({
        label: 'Face type',
        value: state.kind,
        onChange: (kind) => set({ kind }),
        options: KINDS[state.size].map((k) => ({ value: k, label: APL.FACE_NAMES[k] })),
        fk: 'kind',
      }),
    ),
    story(
      'TargetFace',
      h(
        'div',
        { class: 'demo-row' },
        ['full', 'six', 'triple', 'vegas'].map((kind) => APL.TargetFace({ kind, size: 64 })),
      ),
    ),
    story(
      'RepeatCard',
      APL.RepeatCard({ title: 'Same as last session', summary: '18 m · 40 cm triple · 3 arrows/end' }),
    ),
    story(
      'FieldButton',
      h(
        'div',
        { class: 'apl-grid-2' },
        APL.FieldButton({ icon: 'calendar', value: 'Today', hint: 'Sun, 15 Nov' }),
        APL.FieldButton({ icon: 'clock', value: '18:18', hint: 'Now' }),
      ),
    ),
    story(
      'SelectCard · AddButton',
      h(
        'div',
        { class: 'apl-list' },
        [
          ['recurve', 'Recurve', 'Hoyt · 36 lb'],
          ['none', 'No equipment', 'Log without a bow setup'],
        ].map(([id, title, detail]) =>
          APL.SelectCard({
            title,
            detail,
            selected: state.bow === id,
            onClick: () => set({ bow: id }),
            fk: `bow-${id}`,
          }),
        ),
        APL.AddButton({ children: 'Add equipment' }),
      ),
    ),
    story(
      'BottomBar',
      APL.BottomBar({
        summary: `${state.distance} m · ${state.size} cm · ${state.arrows} arrows/end`,
        children: APL.Button({ children: 'Start session', trailingIcon: 'arrowRight' }),
      }),
    ),
    h('h2', { class: 'apl-label' }, 'App additions'),
    story(
      'NavRow',
      h(
        'div',
        { class: 'apl-list' },
        APL.NavRow({ href: '#', icon: 'target', title: 'History', detail: '12 sessions' }),
        APL.NavRow({
          href: '#',
          title: 'Training',
          detail: 'Score arrow by arrow with M / S grades',
          badge: APL.Badge({ children: 'Last used', tone: 'neutral' }),
        }),
      ),
    ),
    story(
      'Banner',
      APL.Banner({ title: 'New version available', action: { label: 'Reload', onClick: () => {} } }),
      APL.Banner({
        href: '#',
        tone: 'accent',
        indicator: 'live',
        title: 'Blank bale running',
        detail: '42 arrows',
        trailing: h('span', { class: 'timer-value' }, '24:10'),
        action: { label: 'Continue' },
      }),
      APL.Banner({
        href: '#',
        tone: 'accent',
        indicator: 'paused',
        title: 'SPT running',
        action: { label: 'Continue' },
      }),
    ),
    story(
      'TabBar',
      APL.TabBar({
        label: 'Sections',
        items: ['Dashboard', 'History', 'Insights', 'Gear', 'Sights'].map((label, i) => ({
          id: label,
          label,
          icon: ['target', 'calendar', 'arrowRight', 'bow', 'clock'][i],
          href: '#',
          current: i === 0,
        })),
      }),
    ),
    story(
      'TextField',
      APL.TextField({ label: 'Event', placeholder: 'e.g. Indoor Cup Bratislava', fk: 'tf-event' }),
      h(
        'div',
        { class: 'apl-grid-2' },
        APL.TextField({ label: 'Duration', type: 'number', inputmode: 'numeric', suffix: 'min', value: 45 }),
        APL.TextField({ label: 'Arrows shot', type: 'number', inputmode: 'numeric', value: state.count }),
      ),
    ),
    story('TextArea', APL.TextArea({ label: 'Note', placeholder: '…' })),
    story(
      'TimerButton',
      h(
        'div',
        { class: 'demo-row' },
        APL.TimerButton({
          running: state.timerOn,
          text: '12:34',
          onToggle: () => set({ timerOn: !state.timerOn }),
          fk: 'timer',
        }),
        APL.TimerButton({ running: false, text: '1:05:12', size: 'lg' }),
      ),
    ),
    story(
      'OptionPills (multiple)',
      APL.OptionPills({
        label: 'What you practised',
        multiple: true,
        value: state.techniques,
        options: ['Visualisation', 'Breathing', 'Shot routine', 'Relaxation'].map((t) => ({
          value: t,
          label: t,
        })),
        onChange: (t) =>
          set({
            techniques: state.techniques.includes(t)
              ? state.techniques.filter((x) => x !== t)
              : [...state.techniques, t],
          }),
        fk: 'tech',
      }),
    ),
  );
  if (focusKey) root.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus();
}

render();

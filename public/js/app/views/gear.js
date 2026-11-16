// Gear tab: the current equipment setup with its sight marks, and saved setup snapshots (HANDOFF §7).
// Sight marks belong to the setup (1:1): saving, updating and loading a setup carries them along.
import { h, formatDate, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { GEAR_GROUPS, GEAR_KEYS, filledCount, hasGear, isBlankMark, markCount, sightMarks } from '../gearFields.js';
import { T } from '../strings.js';
import { card } from './common.js';

export function renderGear(ctx) {
  const settings = ctx.repo.getSettings();
  const gear = settings.gear || {};
  const filled = (fields) => `${filledCount(fields)} / ${GEAR_KEYS.length} filled`;
  const counter = h('span', { class: 'apl-cap13 apl-header-count', 'aria-live': 'polite' }, filled(gear));

  const onInput = (key) => (e) => {
    const next = { ...ctx.repo.getSettings().gear, [key]: e.target.value };
    // Editing detaches the setup from the snapshot it was loaded from.
    if (ctx.saveSettings({ gear: next, activeSnapshotId: null })) counter.textContent = filled(next);
  };

  const sights = sightsCard(ctx, gear);

  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const nameField = APL.TextField({
    label: T.snapshotName,
    placeholder: T.snapshotPh,
    value: ctx.ui.get().snapName || '',
    fk: 'snap-name',
    onInput: (e) => ctx.ui.quietSet({ snapName: e.target.value }),
  });
  const nameInput = nameField.querySelector('input');

  const saveSnap = () => {
    const name = nameInput.value.trim() || `Setup ${snapshots.length + 1}`;
    const saved = ctx.save('gearSnapshots', { name, date: todayIso(), fields: structuredClone(ctx.repo.getSettings().gear) });
    if (saved) {
      ctx.saveSettings({ activeSnapshotId: saved.id, loadedSnapshotId: saved.id });
      ctx.ui.quietSet({ snapName: '' });
      ctx.rerender();
    }
  };

  // The setup loaded from a saved one can be written back to it (sessions keep their own copy).
  const loaded = snapshots.find((sn) => sn.id === (settings.loadedSnapshotId ?? settings.activeSnapshotId));
  const updateSnap = () => {
    const cur = ctx.repo.get('gearSnapshots', loaded.id);
    if (!cur) return;
    const saved = ctx.save('gearSnapshots', { ...cur, date: todayIso(), fields: structuredClone(ctx.repo.getSettings().gear) });
    if (saved) {
      ctx.saveSettings({ activeSnapshotId: saved.id, loadedSnapshotId: saved.id });
      ctx.toast(`"${saved.name}" updated`);
      ctx.rerender();
    }
  };

  const load = async (sn) => {
    if (
      hasGear(ctx.repo.getSettings().gear) &&
      !(await confirmDialog({ title: 'Load this setup?', message: T.confirmLoadSnap(sn.name), confirmLabel: T.load }))
    )
      return;
    if (ctx.saveSettings({ gear: structuredClone(sn.fields), activeSnapshotId: sn.id, loadedSnapshotId: sn.id })) ctx.rerender();
  };

  const remove = async (sn) => {
    const ok = await confirmDialog({
      title: 'Delete snapshot?',
      message: T.confirmDeleteSnap(sn.name),
      confirmLabel: T.delete,
      danger: true,
    });
    if (!ok) return;
    ctx.remove('gearSnapshots', sn.id);
    const st = ctx.repo.getSettings();
    if (st.activeSnapshotId === sn.id || st.loadedSnapshotId === sn.id) {
      ctx.saveSettings({
        activeSnapshotId: st.activeSnapshotId === sn.id ? null : st.activeSnapshotId,
        loadedSnapshotId: st.loadedSnapshotId === sn.id ? null : st.loadedSnapshotId,
      });
    }
    ctx.rerender();
  };

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: T.equipment, trailing: counter }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        GEAR_GROUPS.map((gr, gi) =>
          card(
            { class: 'apl-card' },
            APL.Section({
              label: gr.title,
              id: `gear-group-${gi}`,
              children: h(
                'div',
                { class: 'apl-grid-2' },
                gr.fields.map(([key, label, ph]) =>
                  APL.TextField({ label, value: gear[key] || '', placeholder: ph, fk: `g-${key}`, onInput: onInput(key) }),
                ),
              ),
            }),
          ),
        ),
        sights,
        card(
          { class: 'apl-card' },
          APL.Section({
            label: T.snapshots,
            id: 'snaps',
            children: [
              nameField,
              loaded
                ? h(
                    'div',
                    { class: 'apl-grid-2' },
                    APL.Button({ children: 'Update', label: `Update "${loaded.name}"`, onClick: updateSnap, fk: 'update-snap' }),
                    APL.Button({ children: 'Save as new', variant: 'secondary', onClick: saveSnap, fk: 'save-snap' }),
                  )
                : APL.Button({ children: T.save, onClick: saveSnap, fk: 'save-snap' }),
              snapshots.length ? null : h('p', { class: 'apl-cap13' }, T.noSnaps),
              snapshots.length
                ? h(
                    'ul',
                    { class: 'apl-list plain-list' },
                    snapshots.map((sn) =>
                      h(
                        'li',
                        null,
                        APL.SessionRow({
                          when: sn.name,
                          type: settings.activeSnapshotId === sn.id ? 'Current' : null,
                          summary: [formatDate(sn.date), `${filledCount(sn.fields)} fields`, sightSummary(sn.fields)].filter(Boolean).join(' · '),
                          actions: [
                            APL.Button({
                              children: T.load,
                              variant: 'secondary',
                              label: `${T.load} ${sn.name}`,
                              onClick: () => load(sn),
                              fk: `load-${sn.id}`,
                            }),
                            h(
                              'button',
                              {
                                type: 'button',
                                class: 'btn btn-text danger',
                                'aria-label': `${T.delete} ${sn.name}`,
                                dataset: { fk: `delete-${sn.id}` },
                                onClick: () => remove(sn),
                              },
                              T.delete,
                            ),
                          ],
                        }),
                      ),
                    ),
                  )
                : null,
            ],
          }),
        ),
      ),
    ),
  };
}

const sightSummary = (fields) => {
  const n = markCount(fields);
  return n ? `${n} sight ${n === 1 ? 'mark' : 'marks'}` : '';
};

/**
 * The current setup's sight marks: distance, elevation, windage and note on one row. Editing them is
 * editing the setup (it detaches it from the saved one it was loaded from, like any field).
 */
function sightsCard(ctx, gear) {
  const ui = ctx.ui.get();
  const keep = ui.newSightIds || [];
  const focusId = ui.focusSight;
  if (focusId) ctx.ui.quietSet({ focusSight: null });

  // Empty rows are not kept, except ones added in this visit (dropping them is no change to the setup).
  if (Array.isArray(gear.sights) && gear.sights.some((m) => isBlankMark(m) && !keep.includes(m.id))) {
    gear.sights = gear.sights.filter((m) => !isBlankMark(m) || keep.includes(m.id));
    ctx.saveSettings({ gear: { ...ctx.repo.getSettings().gear, sights: gear.sights } });
  }
  const marks = [...sightMarks(gear)].sort((a, b) => sortKey(a) - sortKey(b));

  /** Store the setup's marks after `fn`; the default rows become stored ones on the first edit. */
  const setMarks = (fn) => {
    const cur = ctx.repo.getSettings().gear || {};
    return ctx.saveSettings({ gear: { ...cur, sights: fn(sightMarks(cur).map((m) => ({ ...m }))) }, activeSnapshotId: null });
  };
  const onSight = (id, key) => (e) => setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, [key]: e.target.value } : m)));

  const addRow = () => {
    const id = crypto.randomUUID();
    if (setMarks((ms) => [...ms, { id, distance: '', elevation: '', windage: '', note: '' }])) {
      ctx.ui.quietSet({ newSightIds: [...keep, id], focusSight: id });
      ctx.rerender();
    }
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

  return card(
    { class: 'apl-card' },
    APL.Section({
      label: T.sightMarks,
      id: 'gear-sights',
      children: h(
        'div',
        { class: 'sight-card' },
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
        h('p', { class: 'apl-cap' }, 'Marks for this setup, saved with it. Clear every field of a row to remove it.'),
      ),
    }),
  );
}

function sortKey(m) {
  const n = parseInt(m.distance, 10);
  return Number.isFinite(n) ? n : 9999;
}

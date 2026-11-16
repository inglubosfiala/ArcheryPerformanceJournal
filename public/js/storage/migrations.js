// Ordered schema upgrade steps: { from, to, up(doc) → doc }.
// Add a step here and bump SCHEMA_VERSION in config.js when the document shape changes.
export const migrations = [
  {
    // v2: Google Drive sync. Adds the timestamp used to merge the synced settings
    // (gear setup) between devices. Deleted records may now be kept as markers
    // ({ id, deleted: true, deletedAt, updatedAt }); existing records are unchanged.
    from: 1,
    to: 2,
    up(doc) {
      return { ...doc, meta: { ...(doc.meta || {}), settingsUpdatedAt: doc.meta?.settingsUpdatedAt ?? null } };
    },
  },
  {
    // v3: session types (training, competition, strength, mental). Every existing session is a
    // training session. Older app versions refuse v3 data instead of dropping sessions they don't know.
    from: 2,
    to: 3,
    up(doc) {
      const sessions = (doc.collections?.sessions || []).map((s) => (s.deleted || s.type ? s : { ...s, type: 'training' }));
      return { ...doc, collections: { ...(doc.collections || {}), sessions } };
    },
  },
  {
    // v4: the blank bale session type. The data is unchanged; the version tells older app versions
    // (which would skip blank bale sessions on sync and so drop them from Drive) to refuse it.
    from: 3,
    to: 4,
    up(doc) {
      return { ...doc };
    },
  },
  {
    // v5: the manual session type. As in v4, only the version changes, so older app versions
    // refuse the data instead of dropping manual sessions on sync.
    from: 4,
    to: 5,
    up(doc) {
      return { ...doc };
    },
  },
  {
    // v6: sight marks belong to a gear setup (1:1). The sightMarks collection becomes the `sights`
    // list of the current setup (settings.gear.sights); every saved setup gets a copy of it, since
    // the marks applied to all of them until now. Blank rows are dropped; sessions are unchanged.
    from: 5,
    to: 6,
    up(doc) {
      const { sightMarks, ...collections } = doc.collections || {};
      const { sightsSeeded: _seeded, ...settings } = doc.settings || {};
      const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
      const dist = (m) => {
        const n = parseInt(m.distance, 10);
        return Number.isFinite(n) ? n : 9999;
      };
      const marks = (sightMarks || [])
        .filter((m) => m && !m.deleted && !m.trashedAt)
        .map((m) => ({ id: String(m.id), distance: text(m.distance), elevation: text(m.elevation), windage: text(m.windage), note: text(m.note) }))
        .filter((m) => [m.distance, m.elevation, m.windage, m.note].some((v) => v.trim()))
        .sort((a, b) => dist(a) - dist(b));
      // none typed in: the setups show the default distances, as on a fresh install
      if (!marks.length) return { ...doc, settings, collections };
      const withMarks = (fields) => (Array.isArray(fields?.sights) ? fields : { ...(fields || {}), sights: structuredClone(marks) });
      collections.gearSnapshots = (collections.gearSnapshots || []).map((sn) => (sn.deleted ? sn : { ...sn, fields: withMarks(sn.fields) }));
      return { ...doc, settings: { ...settings, gear: withMarks(settings.gear) }, collections };
    },
  },
];

export class NewerVersionError extends Error {
  constructor(found, supported) {
    super(`Data was written by a newer app version (schema ${found}, this app supports ${supported}). Reload to update the app.`);
    this.name = 'NewerVersionError';
  }
}

/** Upgrade `doc` step by step to `target`. Returns a new document; the input is not mutated. */
export function migrate(doc, target, steps = migrations) {
  let current = structuredClone(doc);
  let version = Number(current.schemaVersion || 1);
  if (version > target) throw new NewerVersionError(version, target);
  while (version < target) {
    const step = steps.find((s) => s.from === version);
    if (!step) throw new Error(`No migration from schema ${version}`);
    current = step.up(current);
    version = step.to;
    current.schemaVersion = version;
  }
  return current;
}

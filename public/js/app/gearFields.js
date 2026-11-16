// Equipment fields (HANDOFF §7): [key, label, placeholder hint]. A setup also holds its sight marks (below).
export const GEAR_GROUPS = [
  {
    title: 'Bow',
    fields: [
      ['riser', 'Riser', 'model'],
      ['limbsModel', 'Limbs model', 'model'],
      ['limbsLbs', 'Limbs poundage', 'lbs'],
      ['drawWeight', 'Draw weight on fingers', 'lbs'],
    ],
  },
  {
    title: 'Arrows',
    fields: [
      ['arrowModel', 'Arrow model', 'model'],
      ['spine', 'Spine', ''],
      ['arrowLength', 'Length', 'in'],
      ['points', 'Points', 'grain'],
      ['nocks', 'Nocks', ''],
    ],
  },
  {
    title: 'String',
    fields: [
      ['stringMat', 'Material', ''],
      ['strands', 'Strands', 'count'],
      ['brace', 'Brace height', 'in'],
      ['nockPoint', 'Nocking point', 'mm'],
    ],
  },
  {
    title: 'Tuning',
    fields: [
      ['tillerTop', 'Tiller top', 'mm'],
      ['tillerBottom', 'Tiller bottom', 'mm'],
      ['plungerTension', 'Plunger tension', ''],
      ['plungerPos', 'Plunger position', ''],
      ['rest', 'Arrow rest', ''],
      ['clicker', 'Clicker position', ''],
    ],
  },
  {
    title: 'Stabilisers & accessories',
    fields: [
      ['stabLong', 'Long rod', 'length'],
      ['stabSides', 'Side rods', 'length'],
      ['vbar', 'V-bar', 'angle'],
      ['stabWeights', 'Weights', 'oz'],
      ['tab', 'Tab', ''],
      ['sight', 'Sight', ''],
    ],
  },
];

export const GEAR_KEYS = GEAR_GROUPS.flatMap((g) => g.fields.map((f) => f[0]));

export function filledCount(fields) {
  return GEAR_KEYS.filter((k) => fields && String(fields[k] ?? '').trim()).length;
}

// ---------------------------------------------------------------- sight marks
// A gear setup owns its sight marks (1:1): they live in the setup as `sights`, a list of
// { id, distance, elevation, windage, note }. They travel with it into saved setups and sessions.

export const SIGHT_KEYS = ['distance', 'elevation', 'windage', 'note'];
export const DEFAULT_SIGHT_DISTANCES = ['18', '30', '50', '60', '70', '90'];

/** A row with nothing typed in it (it is not kept). */
export const isBlankMark = (m) => SIGHT_KEYS.every((k) => !String(m?.[k] ?? '').trim());

/** A row with a mark set (elevation or windage), not just a distance. */
export const hasMark = (m) => Boolean(String(m?.elevation ?? '').trim() || String(m?.windage ?? '').trim());

/**
 * The sight marks of a setup. A setup that has never had any shows the default distances (not stored
 * until one is typed in; fixed ids so the focus survives the first edit).
 */
export function sightMarks(gear) {
  if (Array.isArray(gear?.sights)) return gear.sights;
  return DEFAULT_SIGHT_DISTANCES.map((d) => ({ id: `seed-${d}`, distance: `${d} m`, elevation: '', windage: '', note: '' }));
}

/** The number of rows with a mark set. */
export const markCount = (gear) => (Array.isArray(gear?.sights) ? gear.sights.filter(hasMark).length : 0);

/** The sight mark saved for a distance in metres, or null. */
export function findSightMark(gear, distance) {
  return (Array.isArray(gear?.sights) ? gear.sights : []).find((m) => parseInt(m.distance, 10) === distance && hasMark(m)) || null;
}

/** Validation errors of a `sights` value (undefined is fine: no marks yet). */
export function sightErrors(sights) {
  if (sights == null) return [];
  if (!Array.isArray(sights)) return ['sight marks must be a list'];
  return sights.flatMap((m, i) =>
    !m || typeof m !== 'object' || typeof m.id !== 'string' || SIGHT_KEYS.some((k) => typeof m[k] !== 'string')
      ? [`sight mark ${i + 1} is invalid`]
      : [],
  );
}

/** Anything recorded in a setup: a field or a sight mark. */
export const hasGear = (gear) => filledCount(gear) > 0 || markCount(gear) > 0;

/**
 * Equipment choices for a session: the current Gear setup (unless it is just a loaded saved setup),
 * each saved setup, "as recorded" when editing a session whose equipment matches neither, and none.
 * Returns { options: [[value, label]], value } for a select.
 */
export function gearChoices({ settings, snapshots, session = null }) {
  const active = snapshots.find((sn) => sn.id === settings.activeSnapshotId);
  const options = [];
  let value;
  if (session) {
    const own = snapshots.find((sn) => sn.id === session.gearSnapshotId);
    if (own) value = own.id;
    else if (hasGear(session.gear)) {
      options.push(['recorded', 'As recorded']);
      value = 'recorded';
    } else value = 'none';
  } else value = active ? active.id : hasGear(settings.gear) ? 'current' : 'none';
  if (!active && hasGear(settings.gear)) options.push(['current', 'Current Gear setup']);
  for (const sn of snapshots) options.push([sn.id, sn.name]);
  options.push(['none', 'No equipment']);
  return { options, value };
}

/** The { gear, gearSnapshotId } a session stores for a choice (null for "as recorded": keep it). */
export function gearForChoice(choice, { settings, snapshots }) {
  if (choice === 'recorded') return null;
  if (choice === 'none') return { gear: null, gearSnapshotId: null };
  if (choice === 'current') return { gear: structuredClone(settings.gear || {}), gearSnapshotId: settings.activeSnapshotId || null };
  const sn = snapshots.find((x) => x.id === choice);
  return sn ? { gear: structuredClone(sn.fields), gearSnapshotId: sn.id } : null;
}

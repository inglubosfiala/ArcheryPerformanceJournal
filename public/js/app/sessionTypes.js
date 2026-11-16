// Session types (training, blank bale, competition, strength, mental, gym) and the fields of the non-scored ones.
import { faceLabel, withCompound, isCompoundFace } from './scoring.js';
import { gymSummary } from './gym.js';

export const SESSION_TYPES = ['training', 'blank', 'competition', 'strength', 'mental', 'manual', 'gym'];

export const TYPE_LABELS = {
  training: 'Training',
  blank: 'Blank bale',
  competition: 'Competition',
  strength: 'SPT', // specific physical training: the bow-strength drills
  mental: 'Mental',
  manual: 'Logged afterwards', // shown as "Log afterwards" on the New session page
  gym: 'Gym', // with SPT, the "Strength" choice on the New session page
};

/** Session types that record a number of arrows instead of scoring them. */
export const countsArrows = (type) => type === 'blank' || type === 'manual';

/**
 * Training and competition are scored arrow by arrow on the Log; the others are a short form.
 * Manual: arrows and / or duration typed in afterwards, with a date and no timer.
 */
export function isScored(type) {
  return type == null || type === 'training' || type === 'competition';
}

export const sessionType = (session) => session.type || 'training';

/**
 * Whether a scored session asks for the M / S grades of each arrow. Chosen on the Shooting page;
 * sessions stored before the choice existed (no `grading` field) are graded.
 */
export const isGraded = (session) => session?.grading !== false;

const pad2 = (n) => String(n).padStart(2, '0');
/** Local HH:MM of a Date (or ISO string); '' when it is not a date. */
export function hourMinute(d) {
  const t = d instanceof Date ? d : new Date(d ?? NaN);
  return Number.isNaN(t.getTime()) ? '' : `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}
export const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * Newest first by when the session took place: its date and start time (sessions logged before the
 * time was recorded use the time they were created).
 */
const sortKey = (s) => `${s.date} ${s.time || hourMinute(s.createdAt)} ${s.createdAt || ''}`;
export const newestFirst = (a, b) => sortKey(b).localeCompare(sortKey(a));

/**
 * Bow-specific strength drills. `hold`: the drill has a hold time in seconds. `short`: the name on
 * the "+ …" chip that adds it, when shorter than `label`. `retired`: no longer
 * offered for new sessions (holding at full draw is what SPT holds are), but sessions that have it
 * keep it and stay valid.
 */
export const DRILLS = [
  { id: 'spt', label: 'SPT holds', hold: true },
  { id: 'hold', label: 'Holding at full draw', hold: true, retired: true },
  { id: 'draw', label: 'Draws with the bow', short: 'Draws with bow', hold: false },
  { id: 'band', label: 'Band draws', hold: false },
];
export const DRILL_IDS = DRILLS.map((d) => d.id);
export const drillLabel = (id) => DRILLS.find((d) => d.id === id)?.label || id;

/**
 * Common routines for a drill with a hold, offered as one-tap chips: sets × reps holds of `hold`
 * seconds, with `rest` seconds after each hold. Edit freely: the chip whose numbers match the
 * drill shows as selected.
 */
export const SPT_PRESETS = [
  { label: '6 × 20 s · 40 s rest', sets: 1, reps: 6, hold: 20, rest: 40 },
  { label: '6 × 15 s · 40 s rest', sets: 1, reps: 6, hold: 15, rest: 40 },
];

/** What the −/+ tiles of a drill allow: [min, max, step] per drill field. */
export const DRILL_LIMITS = {
  sets: [1, 10, 1],
  reps: [1, 30, 1],
  holdSec: [5, 120, 5],
  restSec: [5, 180, 5],
};

export const MENTAL_TECHNIQUES = ['Visualisation', 'Breathing', 'Shot routine', 'Relaxation', 'Blank boss', 'Self-talk'];

/** What a gym session works on: chips on the Gym setup page, any number picked. */
export const GYM_FOCUS = ['Full body', 'Upper body', 'Lower body', 'Core', 'Cardio', 'Mobility', 'Shoulder prehab'];

/**
 * Exercises offered as "+ …" chips on the running gym session. `unit` 's': a set is held for
 * seconds (a plank) instead of counted in reps.
 */
export const GYM_EXERCISES = [
  { name: 'Face pulls', unit: 'reps' },
  { name: 'Shoulder press', unit: 'reps' },
  { name: 'Rotator cuff', unit: 'reps' },
  { name: 'Deadlift', unit: 'reps' },
  { name: 'Squat', unit: 'reps' },
  { name: 'Push-ups', unit: 'reps' },
  { name: 'Pull-ups', unit: 'reps' },
  { name: 'Seated row', unit: 'reps' },
  { name: 'Plank', unit: 's' },
];

export const EFFORT_MAX = 10;
export const FOCUS_MAX = 5;

export function emptyDrill(kind) {
  // a drill with a hold also has the rest after each hold (for the interval timer)
  const hold = DRILLS.find((d) => d.id === kind)?.hold;
  return { kind, sets: 1, reps: 10, holdSec: hold ? 10 : null, ...(hold ? { restSec: 10 } : {}) };
}

/** A session's review: what went well, what to work on, how. */
export const emptyReview = () => ({ good: '', workOn: '', how: '' });

/** A competition session's details (placement is usually known only after the event). */
export const emptyCompetition = () => ({ event: '', round: '', conditions: '', placement: '' });

/**
 * World Archery target rounds (WA Book 2 4.5.1, Book 6 48.1): each a list of passes, one per distance,
 * with its face, arrows and the usual arrows per end. A session is shot at one distance, so picking a
 * round fills in its first pass. 1440: the men's distances; the others shoot 70/60/50/30 m or
 * 60/50/40/30 m.
 */
export const WA_ROUNDS = [
  { name: 'WA 18 m', passes: [{ distance: 18, face: '40t', arrows: 60, arrowsPerEnd: 3 }] },
  { name: 'WA 25 m', passes: [{ distance: 25, face: '60', arrows: 60, arrowsPerEnd: 3 }] },
  {
    name: 'WA 25 + 18 m',
    passes: [
      { distance: 25, face: '60', arrows: 60, arrowsPerEnd: 3 },
      { distance: 18, face: '40t', arrows: 60, arrowsPerEnd: 3 },
    ],
  },
  { name: 'WA 70 m', passes: [{ distance: 70, face: '122', arrows: 72, arrowsPerEnd: 6 }] },
  { name: 'WA 60 m', passes: [{ distance: 60, face: '122', arrows: 72, arrowsPerEnd: 6 }] },
  { name: 'WA 50 m compound', passes: [{ distance: 50, face: '80r', arrows: 72, arrowsPerEnd: 6 }] },
  { name: 'WA 50 m barebow', passes: [{ distance: 50, face: '122', arrows: 72, arrowsPerEnd: 6 }] },
  { name: 'WA 40 m', passes: [{ distance: 40, face: '122', arrows: 72, arrowsPerEnd: 6 }] },
  {
    name: 'WA 1440',
    passes: [
      { distance: 90, face: '122', arrows: 36, arrowsPerEnd: 6 },
      { distance: 70, face: '122', arrows: 36, arrowsPerEnd: 6 },
      { distance: 50, face: '80', arrows: 36, arrowsPerEnd: 3 },
      { distance: 30, face: '80', arrows: 36, arrowsPerEnd: 3 },
    ],
  },
  {
    name: 'WA 900',
    passes: [
      { distance: 60, face: '122', arrows: 30, arrowsPerEnd: 6 },
      { distance: 50, face: '122', arrows: 30, arrowsPerEnd: 6 },
      { distance: 40, face: '122', arrows: 30, arrowsPerEnd: 6 },
    ],
  },
];

/** Rounds offered as chips; any other round is typed in ("Other"). */
export const ROUNDS = WA_ROUNDS.map((r) => r.name);

export const roundByName = (name) => WA_ROUNDS.find((r) => r.name === name) || null;

/** Arrows and the highest score of a round (every arrow scores at most 10). */
export function roundTotals(round) {
  const arrows = round.passes.reduce((t, p) => t + p.arrows, 0);
  return { arrows, max: arrows * 10 };
}

/**
 * The setup a round suggests: its first pass's distance, face and arrows per end. A compound archer
 * (the current face scored with the inner 10) keeps compound scoring where the face has it.
 */
export function roundSetup(round, currentFace) {
  const [first] = round.passes;
  return {
    distance: first.distance,
    face: withCompound(first.face, isCompoundFace(currentFace)),
    arrowsPerEnd: first.arrowsPerEnd,
  };
}
/** Conditions offered as chips; stored in the competition's `conditions` text, comma-joined. */
export const CONDITIONS = ['Hall', 'Sun', 'Wind', 'Rain', 'Cold', 'Low light'];

/**
 * A conditions text as chips and the rest: each comma- or semicolon-separated part that names a
 * condition (any case) becomes its chip; the other parts stay as text, in their order.
 */
export function parseConditions(text) {
  const parts = String(text || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chips = [];
  const rest = [];
  for (const p of parts) {
    const c = CONDITIONS.find((x) => x.toLowerCase() === p.toLowerCase());
    if (c && !chips.includes(c)) chips.push(c);
    else if (!c) rest.push(p);
  }
  return { chips: CONDITIONS.filter((c) => chips.includes(c)), rest: rest.join(', ') };
}

/** A conditions text with one chip's condition turned on or off; the typed rest is kept. */
export function toggleCondition(text, condition) {
  const { chips, rest } = parseConditions(text);
  return joinConditions(chips.includes(condition) ? chips.filter((c) => c !== condition) : [...chips, condition], rest);
}

/** Chips and the typed rest back into one conditions text ("Hall, Wind, dusty"). */
export function joinConditions(chips, rest = '') {
  return [...CONDITIONS.filter((c) => chips.includes(c)), String(rest || '').trim()].filter(Boolean).join(', ');
}

/**
 * One line describing a scored session's setup: "18 m · face", then the `more` parts given (ends,
 * arrows, duration…; empty ones are left out). Used wherever a scored session is described in a line.
 */
export function setupSummary(session, ...more) {
  return [`${session.distance} m`, faceLabel(session.face), ...more].filter(Boolean).join(' · ');
}

/** One line describing a strength, gym or mental session (History list, Dashboard). */
export function formSummary(session) {
  if (session.type === 'gym') return gymSummary(session);
  const parts = [];
  if (countsArrows(session.type) && session.arrows != null) parts.push(`${session.arrows} arrows`);
  if (session.type === 'blank' && session.goal) parts.push(`goal ${session.goal}`);
  if (session.minutes) parts.push(`${session.minutes} min`);
  if (session.type === 'strength') {
    if (session.effort) parts.push(`effort ${session.effort}/${EFFORT_MAX}`);
    const n = session.drills?.length || 0;
    if (n) parts.push(`${n} ${n === 1 ? 'drill' : 'drills'}`);
  } else if (session.type === 'mental') {
    if (session.focus) parts.push(`focus ${session.focus}/${FOCUS_MAX}`);
    if (session.techniques?.length) parts.push(session.techniques.join(', '));
  }
  return parts.join(' · ');
}

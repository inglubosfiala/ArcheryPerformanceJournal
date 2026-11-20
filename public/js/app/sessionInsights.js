// What a scored session's overview reads from its arrows: the score counts, the average against
// earlier sessions, the M / S grade spread and how grades relate to score, and the group (all arrows
// on one spot, filtered, with its centre and a one-line reading). Pure functions, no DOM.
import { arrowValue, isMultiSpot, keypadValues, scoringProfile } from './scoring.js';
import { isScored, newestFirst } from './sessionTypes.js';

const scored = (ends) => ends.flatMap((e) => e.arrows).filter((a) => a && a.v != null);
const mean = (xs) => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null);

/** X, 10 (without X), 9 and 8 or less (misses included) among the scored arrows. */
export function scoreCounts(ends) {
  const arrows = scored(ends);
  return {
    x: arrows.filter((a) => a.v === 'X').length,
    ten: arrows.filter((a) => a.v === 10).length,
    nine: arrows.filter((a) => a.v === 9).length,
    low: arrows.filter((a) => a.v !== 'X' && arrowValue(a.v) <= 8).length,
  };
}

/** Face-specific score buckets, retaining the original WA summary labels. */
export function scoreSummary(ends, face) {
  if (!scoringProfile(face)) {
    const counts = scoreCounts(ends);
    return [{ label: 'X', count: counts.x }, { label: '10', count: counts.ten }, { label: '9', count: counts.nine }, { label: '8 and less', count: counts.low }];
  }
  const values = keypadValues(face).filter((v) => v !== 'M');
  const top = values.slice(0, 3);
  const arrows = scored(ends);
  const rest = values.slice(3);
  return [
    ...top.map((value) => ({ label: String(value), count: arrows.filter((a) => a.v === value).length })),
    { label: rest.length ? `${rest[0]} and less` : 'Misses', count: arrows.filter((a) => !top.includes(a.v)).length },
  ];
}

/** Earlier sessions needed before the average is shown. */
export const AVERAGE_MIN_SESSIONS = 3;

/**
 * The session's points per arrow against the earlier finished sessions at the same distance and face
 * (their arrows pooled): `{ delta, average, sessions }`, or null with fewer than AVERAGE_MIN_SESSIONS
 * of them or no arrows. Earlier = before it by date and start time.
 */
export function averageDelta(session, finished) {
  const own = scored(session.ends || []);
  if (!own.length) return null;
  const earlier = finished.filter(
    (s) =>
      s.id !== session.id &&
      s.status === 'finished' &&
      isScored(s.type) &&
      s.distance === session.distance &&
      s.face === session.face &&
      newestFirst(s, session) > 0 &&
      scored(s.ends || []).length,
  );
  if (earlier.length < AVERAGE_MIN_SESSIONS) return null;
  const pool = earlier.flatMap((s) => scored(s.ends));
  const average = mean(pool.map((a) => arrowValue(a.v, session.face)));
  return { delta: mean(own.map((a) => arrowValue(a.v, session.face))) - average, average, sessions: earlier.length };
}

/** How many arrows got each grade 1–5 (`kind` 'm' or 's'), how many were graded, and the average. */
export function gradeDistribution(ends, kind) {
  const grades = ends.flatMap((e) => e.arrows).map((a) => a?.[kind]).filter((g) => g != null);
  return { counts: [1, 2, 3, 4, 5].map((g) => grades.filter((x) => x === g).length), n: grades.length, avg: mean(grades) };
}

/** Arrows needed in each group before the grade insight is shown. */
export const INSIGHT_MIN_ARROWS = 3;

/**
 * Points per arrow of the arrows shot with the full mental program (M1) and with M3 or worse:
 * `{ m1: { avg, n }, m3: { avg, n } }`, or null while either group has too few scored arrows.
 */
export function gradeInsight(ends, face) {
  const arrows = scored(ends);
  const group = (keep) => {
    const xs = arrows.filter(keep).map((a) => arrowValue(a.v, face));
    return { avg: mean(xs), n: xs.length };
  };
  const m1 = group((a) => a.m === 1);
  const m3 = group((a) => a.m != null && a.m >= 3);
  return m1.n >= INSIGHT_MIN_ARROWS && m3.n >= INSIGHT_MIN_ARROWS ? { m1, m3 } : null;
}

// ---------------------------------------------------------------- the group

export const GROUP_FILTERS = ['all', 'm1', 'm3', 'last'];
export const FILTER_LABELS = { all: 'All', m1: 'M1 only', m3: 'M3+', last: 'Last of end' };
const FILTER_NAMES = { m1: 'M1 only', m3: 'M3 or worse', last: 'Last of end' };

/**
 * The session's placed arrows on one spot (x, y in spot radii, y downwards; arrows of a multi-spot
 * sheet are merged onto one spot, as their positions are kept per spot), each with its grades and
 * whether it is the last scored arrow of its end. `total`: the scored arrows, placed or not.
 */
export function groupArrows(ends) {
  const arrows = [];
  let total = 0;
  for (const e of ends) {
    const lastIdx = e.arrows.findLastIndex((a) => a?.v != null);
    e.arrows.forEach((a, i) => {
      if (a?.v == null) return;
      total += 1;
      if (a.x == null || a.y == null) return;
      arrows.push({ x: a.x, y: a.y, v: a.v, m: a.m ?? null, s: a.s ?? null, last: i === lastIdx });
    });
  }
  return { arrows, total };
}

const FILTERS = {
  all: () => true,
  m1: (p) => p.m === 1,
  m3: (p) => p.m != null && p.m >= 3,
  last: (p) => p.last,
};

/** The arrows a filter shows. */
export const filterArrows = (arrows, filter) => arrows.filter(FILTERS[filter] || FILTERS.all);

/** Whether one arrow matches a filter. */
export const matchesFilter = (arrow, filter) => (FILTERS[filter] || FILTERS.all)(arrow);

/** The mean point of impact, or null without arrows. */
export function groupCentre(points) {
  if (!points.length) return null;
  const r = (n) => Math.round(n * 1000) / 1000;
  return { x: r(mean(points.map((p) => p.x))), y: r(mean(points.map((p) => p.y))) };
}

/** Off-centre less than this (in spot radii) reads as centred / about the same. */
export const CENTRE_THRESHOLD = 0.05;

/** "high", "low right", "left"… or "centred". */
export function centreDirection(c, t = CENTRE_THRESHOLD) {
  const v = c.y < -t ? 'high' : c.y > t ? 'low' : '';
  const h = c.x < -t ? 'left' : c.x > t ? 'right' : '';
  return [v, h].filter(Boolean).join(' ') || 'centred';
}

/**
 * One line under the face. All: "All 30 arrows: centre low right." A filter: its centre, and how it
 * differs from the centre of all arrows ("— lower and further right than all arrows.").
 */
export function centreReading(shown, all, filter, n, t = CENTRE_THRESHOLD) {
  if (!all) return 'No arrows placed on the face.';
  if (!shown) {
    return filter === 'last' ? 'No placed arrow is the last of its end.' : `No arrows graded ${FILTER_NAMES[filter]} in this session.`;
  }
  const dir = centreDirection(shown, t);
  const where = dir === 'centred' ? 'centre on the middle' : `centre ${dir}`;
  if (filter === 'all') return `All ${n} ${n === 1 ? 'arrow' : 'arrows'}: ${where}.`;
  const dy = shown.y - all.y;
  const dx = shown.x - all.x;
  const diff = [dy > t ? 'lower' : dy < -t ? 'higher' : '', dx > t ? 'further right' : dx < -t ? 'further left' : ''].filter(Boolean);
  const vs = diff.length ? `${diff.join(' and ')} than all arrows` : 'about where all arrows are';
  return `${FILTER_NAMES[filter]} (${n}): ${where} — ${vs}.`;
}

/** The caption under the face: what was merged. */
export const mergedNote = (face) => (isMultiSpot(face) ? 'spots of the sheet merged' : null);

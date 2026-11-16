// What the scoring screen shows about ends (Scoring v2): end sums, the running Σ, grade averages,
// the session's counts for Finish / Discard and the context hint. Pure functions of a running
// session (sessionLogic.js's shape); no DOM.
import { sumArrows } from './stats.js';
import { isMultiSpot, suggestedSpot } from './scoring.js';

const scored = (arrows) => arrows.filter((a) => a && a.v != null);

/** The score of one end (X = 10, M and empty slots = 0). */
export function endSum(end) {
  return sumArrows(end.arrows);
}

/** True when every slot of the end has a score. */
export function isEndComplete(end) {
  return end.arrows.length > 0 && end.arrows.every((a) => a && a.v != null);
}

/** Mean M and S grade of the given arrows; null for a grade no arrow has. */
export function gradeAverages(arrows) {
  const mean = (k) => {
    const xs = arrows.filter((a) => a && a[k] != null).map((a) => a[k]);
    return xs.length ? xs.reduce((t, g) => t + g, 0) / xs.length : null;
  };
  return { m: mean('m'), s: mean('s') };
}

/** Every end of the session in the order shot: the saved ends, then the end being shot. */
function allEnds(session) {
  return [...session.ends, session.current];
}

/** The session's total: every end, the one being shot included. */
export function sessionTotal(session) {
  return allEnds(session).reduce((t, e) => t + endSum(e), 0);
}

/**
 * One row per end, in the order shot: `index` (into ends; the end being shot is ends.length),
 * `n` (its number), `sum`, `run` (the running Σ up to and including it), the grade averages,
 * let-downs and whether it is the end being shot.
 */
export function endRows(session) {
  let run = 0;
  return allEnds(session).map((e, i) => {
    const sum = endSum(e);
    run += sum;
    const g = gradeAverages(e.arrows);
    return {
      index: i,
      n: i + 1,
      arrows: e.arrows,
      sum,
      run,
      avgM: g.m,
      avgS: g.s,
      ld: e.ld || 0,
      cld: e.cld || 0,
      isCurrent: i === session.ends.length,
    };
  });
}

/** What Finish keeps and Discard loses: ends with arrows, scored arrows, the total. */
export function sessionCounts(session) {
  const ends = allEnds(session).filter((e) => scored(e.arrows).length > 0);
  return {
    ends: ends.length,
    arrows: ends.reduce((t, e) => t + scored(e.arrows).length, 0),
    total: sessionTotal(session),
  };
}

/**
 * The context hint next to the end's chips, for the shown end and its selected arrow:
 * - nothing entered yet: "Tap a spot or a score" ("Tap the face or a score" on a single face);
 * - the selected arrow has a score but not both grades: "Grade arrow N";
 * - otherwise the slot to fill next: "Next: spot N" on a sheet of several spots, else
 *   "Next: arrow N"; "End complete" when every slot has a score.
 */
export function scoringHint(session) {
  const end = session.view == null ? session.current : session.ends[session.view];
  const { arrows } = end;
  const cursor = session.cursor;
  const picked = arrows[cursor];
  const multi = isMultiSpot(session.face);
  if (picked && picked.v != null && (picked.m == null || picked.s == null)) return `Grade arrow ${cursor + 1}`;
  if (!scored(arrows).length) return multi ? 'Tap a spot or a score' : 'Tap the face or a score';
  // the slot that receives the next score: the selected one while empty, else the first empty one
  const next = picked && picked.v == null ? cursor : arrows.findIndex((a) => a.v == null);
  if (next < 0) return 'End complete';
  if (multi) return `Next: spot ${suggestedSpot(session.face, arrows, next) + 1}`;
  return `Next: arrow ${next + 1}`;
}

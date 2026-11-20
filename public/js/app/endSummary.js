// What the scoring screen shows about ends (Scoring v2): end sums, the running Σ, grade averages,
// the session's counts for Finish / Discard and the context hint. Pure functions of a running
// session (sessionLogic.js's shape); no DOM.
import { sumArrows } from './stats.js';

const scored = (arrows) => arrows.filter((a) => a && a.v != null);

/** The score of one end (X = 10, M and empty slots = 0). */
export function endSum(end, face) {
  return sumArrows(end.arrows, face);
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
  return allEnds(session).reduce((t, e) => t + endSum(e, session.face), 0);
}

/**
 * One row per end, in the order shot: `index` (into ends; the end being shot is ends.length),
 * `n` (its number), `sum`, `run` (the running Σ up to and including it), the grade averages,
 * let-downs and whether it is the end being shot.
 */
export function endRows(session) {
  let run = 0;
  return allEnds(session).map((e, i) => {
    const sum = endSum(e, session.face);
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

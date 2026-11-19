// The heart-rate curve of one end (from the watch, see watchCode.js) as a small chart: the line of
// the trace and a dot at each shot. Pure; the view draws it as SVG.
import { traceAt } from './watchCode.js';

/**
 * Chart geometry in a `w` × `h` box for an end's `hrTrace` { step, hr } and its arrows (each with
 * its shot time `t`), or null when the end has no trace. The heart-rate axis spans the trace's own
 * range (at least 10 beats, so a flat curve stays flat).
 *   { points: "x,y x,y …", shots: [{ x, y, hr, m }], min, max, seconds }
 */
export function hrChart(trace, arrows = [], { w = 200, h = 40, pad = 3 } = {}) {
  if (!trace?.hr?.length) return null;
  const hr = trace.hr;
  let min = Math.min(...hr);
  let max = Math.max(...hr);
  if (max - min < 10) {
    const mid = (max + min) / 2;
    min = mid - 5;
    max = mid + 5;
  }
  const seconds = Math.max(trace.step, (hr.length - 1) * trace.step);
  const x = (t) => pad + (Math.min(t, seconds) / seconds) * (w - 2 * pad);
  const y = (v) => pad + ((max - v) / (max - min)) * (h - 2 * pad);
  const r = (n) => Math.round(n * 10) / 10;
  const points = hr.map((v, i) => `${r(x(i * trace.step))},${r(y(v))}`).join(' ');
  const shots = arrows
    .filter((a) => a && a.t != null)
    .map((a) => {
      // the dot sits on the line: the trace's value in the bin of the shot
      const v = traceAt(trace, a.t);
      return { x: r(x(a.t)), y: r(y(v)), hr: v, m: a.m ?? null };
    });
  return { points, shots, min: Math.min(...hr), max: Math.max(...hr), seconds };
}

/**
 * What the watch recorded through one end, for the end's timeline: its shots in the order shot
 * (each with its time, the gap since the shot before, grades, heart rate and score), the end's
 * length and its heart rate. Null when the end has nothing from the watch (no trace, no shot times).
 *   { seconds, shots: [{ no, t, gap, m, s, hr, v }], avgGap, firstShot, lastShot, hr: { min, avg, max } | null }
 */
export function endTimeline(end) {
  const trace = end?.hrTrace?.hr?.length ? end.hrTrace : null;
  const timed = (end?.arrows ?? []).filter((a) => a && a.t != null).sort((a, b) => a.t - b.t);
  if (!trace && !timed.length) return null;
  const shots = timed.map((a, i) => ({
    no: a.no ?? null,
    t: a.t,
    gap: i ? a.t - timed[i - 1].t : null,
    m: a.m ?? null,
    s: a.s ?? null,
    hr: a.hr ?? traceAt(trace, a.t),
    v: a.v ?? null,
  }));
  const gaps = shots.filter((x) => x.gap != null).map((x) => x.gap);
  const lastT = timed.length ? timed[timed.length - 1].t : 0;
  const seconds = Math.max(trace ? trace.hr.length * trace.step : 0, lastT);
  const hr = trace
    ? {
        min: Math.min(...trace.hr),
        avg: Math.round(trace.hr.reduce((t, v) => t + v, 0) / trace.hr.length),
        max: Math.max(...trace.hr),
      }
    : null;
  return {
    seconds,
    shots,
    avgGap: gaps.length ? Math.round(gaps.reduce((t, g) => t + g, 0) / gaps.length) : null,
    firstShot: timed.length ? timed[0].t : null,
    lastShot: timed.length ? lastT : null,
    hr,
  };
}

/** "0:42" / "12:05" for a number of seconds. */
export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

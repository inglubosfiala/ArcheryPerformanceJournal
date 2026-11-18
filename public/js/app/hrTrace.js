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

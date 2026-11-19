// The watch code: the text in the QR code the Arrow Grades watch app shows after an end
// (watch/source/EndState.mc payload()). One end's grades, made on the wrist right after each shot.
//
// Format 3 (watch app 0.6.0 on): format 2 plus the shots the watch's motion detector found, before
// the trace: .D<t 3><set-up 2><draw 2><hold 3><steadiness 1> (times in 0.1 s; steadiness 0-9, 0 =
// stillest), t the second of the release.
// Format 2 (watch app 0.3.0 on):
//   APJ2.E<end>.<arrow>...[.H<step><first hr><changes>]
//   arrow: number (2) · M (1) · S (1) · t (3): the second of the heart-rate trace at the shot
//   H: the heart rate while the end was shot (from 30 s before the first shot to the last), in bins
//      of <step> seconds (1 digit): the first bin's value (3 digits), then one character per bin
//      for its change from the one before, -21..+21 (DELTAS)
// Format 1 (watch app 0.1-0.2):
//   APJ1.E<end>.<arrow>...   arrow: number (2) · M (1) · S (1) · heart rate (3)
//
// M / S 0 = not graded, heart rate 000 = none. Alphanumeric upper case, so the QR code stays small.
// Pure; no DOM.

/** Heart rate kept only within 30-250 beats per minute. */
export const HR_MIN = 30;
export const HR_MAX = 250;
export const ARROW_NO_MAX = 24;
export const SHOT_TIME_MAX = 999;
export const TRACE_STEP_MAX = 9;
export const TRACE_MAX = 300;

const DELTAS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-/:';
// number · M · S · heart rate (format 1) or shot time (format 2)
const ARROW = /^(\d{2})([0-5])([0-5])(\d{3})$/;
const TRACE = /^H([1-9])(\d{3})([0-9A-Z$%*+\-/:]*)$/;
const DETECTED = /^D(\d{3})(\d{2})(\d{2})(\d{3})(\d)$/;
export const DETECTED_MAX = 30;

const bad = { ok: false, error: 'bad' };

/** The trace of a format 2 code ("H2080LMN" → { step: 2, hr: [80, 80, 81, 83] }), or null if damaged. */
function readTrace(part) {
  const m = TRACE.exec(part);
  if (!m) return null;
  const hr = [Number(m[2])];
  for (const ch of m[3]) hr.push(hr[hr.length - 1] + DELTAS.indexOf(ch) - 21);
  if (hr.length > TRACE_MAX || hr.some((v) => v < HR_MIN || v > HR_MAX)) return null;
  return { step: Number(m[1]), hr };
}

/** The heart rate of the trace at second `t` (the bin it falls in; past the end: the last one). */
export function traceAt(trace, t) {
  if (!trace?.hr?.length || t == null) return null;
  return trace.hr[Math.min(Math.floor(t / trace.step), trace.hr.length - 1)];
}

/**
 * Read a scanned code. Returns { ok: true, end, arrows: [{ no, m, s, hr }] } (format 2 and 3 also:
 * each arrow's `t`, the end's `trace` { step, hr } or null and `detected` [{ t, setup, draw, hold,
 * steady }], empty before format 3) with the arrows in arrow-number order,
 * or { ok: false, error } where error is
 *   'not-watch'  not a code of the watch app,
 *   'version'    a newer format than this app reads (update the app),
 *   'bad'        the watch app's code, but damaged.
 */
export function parseWatchCode(text) {
  if (typeof text !== 'string') return { ok: false, error: 'not-watch' };
  const parts = text.trim().toUpperCase().split('.');
  if (!/^APJ\d+$/.test(parts[0])) return { ok: false, error: 'not-watch' };
  const format = { APJ1: 1, APJ2: 2, APJ3: 3 }[parts[0]] ?? 0;
  if (!format) return { ok: false, error: 'version' };
  const endMatch = /^E(\d{1,3})$/.exec(parts[1] ?? '');
  if (!endMatch) return bad;
  let rest = parts.slice(2);
  let trace = null;
  if (format >= 2 && rest.length && rest[rest.length - 1].startsWith('H')) {
    trace = readTrace(rest[rest.length - 1]);
    if (!trace) return bad;
    rest = rest.slice(0, -1);
  }
  const detected = [];
  while (format === 3 && rest.length && rest[rest.length - 1].startsWith('D')) {
    const m = DETECTED.exec(rest[rest.length - 1]);
    if (!m) return bad;
    detected.unshift({ t: Number(m[1]), setup: Number(m[2]) / 10, draw: Number(m[3]) / 10, hold: Number(m[4]) / 10, steady: Number(m[5]) });
    rest = rest.slice(0, -1);
  }
  if (detected.length > DETECTED_MAX) return bad;
  const arrows = [];
  for (const p of rest) {
    const m = ARROW.exec(p);
    if (!m) return bad;
    const no = Number(m[1]);
    if (no < 1 || no > ARROW_NO_MAX || arrows.some((a) => a.no === no)) return bad;
    const grades = { no, m: Number(m[2]) || null, s: Number(m[3]) || null };
    if (format === 1) {
      const hr = Number(m[4]);
      arrows.push({ ...grades, hr: hr >= HR_MIN && hr <= HR_MAX ? hr : null });
    } else {
      const t = Number(m[4]);
      arrows.push({ ...grades, t, hr: traceAt(trace, t) });
    }
  }
  arrows.sort((a, b) => a.no - b.no);
  if (format === 1) return { ok: true, end: Number(endMatch[1]), arrows };
  return { ok: true, end: Number(endMatch[1]), arrows, trace, detected };
}

/** What to tell the archer when a code cannot be used. */
export function watchCodeProblem(error) {
  if (error === 'version') return 'This watch code is newer than the app. Reload the app to update it.';
  if (error === 'bad') return 'The watch code could not be read completely. Scan it again.';
  return 'That is not a code of the Arrow Grades watch app.';
}

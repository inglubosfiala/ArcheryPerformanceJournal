// The watch code: the text in the QR code the Arrow Grades watch app shows after an end
// (watch/source/EndState.mc payload()). One end's grades, made on the wrist right after each shot.
//
//   APJ1.E<end>.<arrow>.<arrow>...   each arrow 7 digits: number (2) · M (1) · S (1) · heart rate (3)
//
// M / S 0 = not graded, heart rate 000 = none. Alphanumeric upper case, so the QR code stays small.
// Pure; no DOM.

const VERSION = 'APJ1';
const ARROW = /^(\d{2})([0-5])([0-5])(\d{3})$/;

/** Heart rate kept only within 30-250 beats per minute (the watch writes 000 for none). */
export const HR_MIN = 30;
export const HR_MAX = 250;
export const ARROW_NO_MAX = 24;

/**
 * Read a scanned code. Returns { ok: true, end, arrows: [{ no, m, s, hr }] } with the arrows in
 * arrow-number order, or { ok: false, error } where error is
 *   'not-watch'  not a code of the watch app,
 *   'version'    a newer format than this app reads (update the app),
 *   'bad'        the watch app's code, but damaged.
 */
export function parseWatchCode(text) {
  if (typeof text !== 'string') return { ok: false, error: 'not-watch' };
  const parts = text.trim().toUpperCase().split('.');
  if (!/^APJ\d+$/.test(parts[0])) return { ok: false, error: 'not-watch' };
  if (parts[0] !== VERSION) return { ok: false, error: 'version' };
  const endMatch = /^E(\d{1,3})$/.exec(parts[1] ?? '');
  if (!endMatch) return { ok: false, error: 'bad' };
  const arrows = [];
  for (const p of parts.slice(2)) {
    const m = ARROW.exec(p);
    if (!m) return { ok: false, error: 'bad' };
    const no = Number(m[1]);
    if (no < 1 || no > ARROW_NO_MAX || arrows.some((a) => a.no === no)) return { ok: false, error: 'bad' };
    const hr = Number(m[4]);
    arrows.push({
      no,
      m: Number(m[2]) || null,
      s: Number(m[3]) || null,
      hr: hr >= HR_MIN && hr <= HR_MAX ? hr : null,
    });
  }
  arrows.sort((a, b) => a.no - b.no);
  return { ok: true, end: Number(endMatch[1]), arrows };
}

/** What to tell the archer when a code cannot be used. */
export function watchCodeProblem(error) {
  if (error === 'version') return 'This watch code is newer than the app. Reload the app to update it.';
  if (error === 'bad') return 'The watch code could not be read completely. Scan it again.';
  return 'That is not a code of the Arrow Grades watch app.';
}

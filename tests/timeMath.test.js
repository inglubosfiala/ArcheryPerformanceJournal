import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  parseTime,
  formatTime,
  addMinutes,
  addHours,
  withMinute,
  withHour,
  parseTyped,
  minutesAgo,
  maxTime,
  isAfterMax,
  quickTimes,
  durationText,
  timeHint,
} from '../public/js/app/timeMath.js';

// the DST cases need a zone with summer time; the app's users are in Central Europe
let tz;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = 'Europe/Bratislava';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const at = (iso) => new Date(iso); // local time (no zone suffix)

describe('time parsing and formatting', () => {
  it('parses only real 24-hour HH:MM times', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('15:51')).toBe(951);
    expect(parseTime('23:59')).toBe(1439);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:05')).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });

  it('formats minutes as HH:MM, wrapping into one day', () => {
    expect(formatTime(951)).toBe('15:51');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(1440)).toBe('00:00');
    expect(formatTime(-1)).toBe('23:59');
  });

  it('reads times typed on the numeric keyboard', () => {
    expect(parseTyped('15:45')).toBe(945);
    expect(parseTyped('1545')).toBe(945);
    expect(parseTyped('905')).toBe(545);
    expect(parseTyped('9:05')).toBe(545);
    expect(parseTyped('9')).toBe(540);
    expect(parseTyped('2460')).toBeNull();
    expect(parseTyped('24:00')).toBeNull();
    expect(parseTyped('abc')).toBeNull();
    expect(parseTyped('')).toBeNull();
  });
});

describe('stepping: wrap and carry', () => {
  it('carries minutes into the hour', () => {
    expect(formatTime(addMinutes(parseTime('15:59'), 1))).toBe('16:00');
    expect(formatTime(addMinutes(parseTime('16:00'), -1))).toBe('15:59');
    expect(formatTime(addMinutes(parseTime('15:55'), 10))).toBe('16:05');
  });

  it('wraps at midnight', () => {
    expect(formatTime(addMinutes(parseTime('23:59'), 1))).toBe('00:00');
    expect(formatTime(addMinutes(parseTime('00:00'), -1))).toBe('23:59');
    expect(formatTime(addHours(parseTime('23:30'), 1))).toBe('00:30');
    expect(formatTime(addHours(parseTime('00:15'), -1))).toBe('23:15');
  });

  it('sets the minutes or the hour alone', () => {
    expect(formatTime(withMinute(parseTime('15:51'), 15))).toBe('15:15');
    expect(formatTime(withHour(parseTime('15:51'), 7))).toBe('07:51');
  });
});

describe('relative to now', () => {
  it('counts whole minutes before now, negative after', () => {
    const now = at('2026-11-16T15:51:40');
    expect(minutesAgo('2026-11-16', '15:51', now)).toBe(0);
    expect(minutesAgo('2026-11-16', '15:06', now)).toBe(45);
    expect(minutesAgo('2026-11-16', '15:52', now)).toBe(-1);
  });

  it('counts real minutes on a DST day', () => {
    // 29 Mar 2026: clocks jump from 02:00 to 03:00, so 01:30 → 03:30 is one hour
    expect(minutesAgo('2026-03-29', '01:30', at('2026-03-29T03:30'))).toBe(60);
    // 25 Oct 2026: clocks go back from 03:00 to 02:00, so 01:30 → 03:30 is three hours
    expect(minutesAgo('2026-10-25', '01:30', at('2026-10-25T03:30'))).toBe(180);
  });

  it('marks the quick chip of the picked time and turns off those reaching into yesterday', () => {
    const chips = quickTimes('15:21', at('2026-11-16T15:51'));
    expect(chips.map((c) => c.time)).toEqual(['15:51', '15:36', '15:21', '14:51']);
    expect(chips.map((c) => c.selected)).toEqual([false, false, true, false]);
    const early = quickTimes('00:20', at('2026-11-16T00:20'));
    expect(early.map((c) => c.disabled)).toEqual([false, false, true, true]);
  });
});

describe('the upper bound', () => {
  const now = at('2026-11-16T15:51');

  it('is now on today, none on other days, or the one given', () => {
    expect(maxTime('2026-11-16', null, now)).toBe('15:51');
    expect(maxTime('2026-11-15', null, now)).toBeNull();
    expect(maxTime(null, null, now)).toBeNull();
    expect(maxTime('2026-11-15', '18:00', now)).toBe('18:00');
  });

  it('flags only times after it', () => {
    expect(isAfterMax('15:52', '15:51')).toBe(true);
    expect(isAfterMax('15:51', '15:51')).toBe(false);
    expect(isAfterMax('23:00', null)).toBe(false);
  });
});

describe('the hint line', () => {
  const now = at('2026-11-16T15:51:20');
  const hint = (time, o = {}) => timeHint({ date: '2026-11-16', time, max: '15:51', now, ...o });

  it('says when the session timer starts', () => {
    expect(hint('15:51').text).toBe('Starts now — the session timer starts at 0:00');
    expect(hint('15:41').text).toBe('Started 10 min ago — the timer starts at 0:10');
  });

  it('draws the 15-minute line where isPastStart does (to the second)', () => {
    const exact = at('2026-11-16T15:51:00');
    expect(hint('15:36', { now: exact }).text).toBe('Started 15 min ago — the timer starts at 0:15');
    // 15 min 20 s ago: already a session logged afterwards
    expect(hint('15:36').text).toBe('Started 15 min ago — logged afterwards, no running timer');
  });

  it('says a start over 15 minutes ago is logged afterwards', () => {
    expect(hint('15:06').text).toBe('Started 45 min ago — logged afterwards, no running timer');
    expect(hint('14:46').text).toBe('Started 1 h 5 min ago — logged afterwards, no running timer');
  });

  it('leaves the timer out where none starts', () => {
    expect(hint('15:06', { timer: false }).text).toBe('Started 45 min ago');
    expect(hint('15:51', { timer: false }).text).toBe('Starts now');
  });

  it('warns about a time later than the bound', () => {
    expect(hint('15:52')).toEqual({ text: 'That is later than now — pick a time up to now', warn: true });
  });

  it('says nothing for other days', () => {
    expect(timeHint({ date: '2026-11-15', time: '15:06', now }).text).toBe('');
  });

  it('writes durations plainly', () => {
    expect(durationText(0)).toBe('0 min');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(60)).toBe('1 h');
    expect(durationText(65)).toBe('1 h 5 min');
  });
});

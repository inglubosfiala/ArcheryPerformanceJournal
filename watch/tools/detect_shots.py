"""The watch's shot detector (watch/source/ShotDetector.mc), line for line in Python, to tune it.

  python watch/tools/detect_shots.py Activity.fit           shots found in the FIT file's raw
                                                            accelerometer, next to the arrow taps
  python watch/tools/detect_shots.py --synthetic            self-test on made-up shots

Keep the constants and the logic in step with ShotDetector.mc.
"""
import math
import random
import sys

RATE = 100                 # samples per second (the watch's raw rate; its 25 Hz stream is smoothed)
ALPHA = 1 / 16             # jitter smoothing per sample (~0.16 s)
QUIET = 15                 # jitter (mg) below which the hand counts as still (still: 2-14 mg)
RELEASE = 550              # |magnitude - 1 g| (mg) of the release snap (real ones: 620-1850 mg)
MIN_HOLD = RATE * 3 // 2   # stillness right before a release: 1.5 s (real holds: 3.5-5 s)
BRIDGE = RATE // 10        # a tremor up to 0.1 s inside a hold does not end it
GAP_AFTER_HOLD = RATE * 2 // 5   # the snap within 0.4 s of the stillness ending
PAUSE = RATE // 2          # a pause that marks the start of the draw: 0.5 s
MAX_DRAW = RATE * 8        # look back at most 8 s for the draw's start
REST = RATE                # a rest before the set-up: 1.0 s
MAX_SETUP = RATE * 8       # look back at most 8 s for the set-up's start
REFRACTORY = RATE * 3      # 3 s between two releases
HISTORY = RATE * 30        # 30 s of quiet flags kept for looking back


class ShotDetector:
    def __init__(self):
        self.shots = []
        self.n = 0
        self.prev = 1000.0
        self.jitter = 0.0
        self.quiet = [0] * HISTORY
        self.jit = [0] * HISTORY
        self.quiet_run = 0
        self.burst = 0
        self.last_run = 0
        self.since_run = 9999
        self.refractory = 0

    def feed(self, xs, ys, zs):
        found = False
        for x, y, z in zip(xs, ys, zs):
            m = math.sqrt(x * x + y * y + z * z)
            d = abs(m - self.prev)
            self.prev = m
            self.jitter = self.jitter * (1 - ALPHA) + d * ALPHA
            still = self.jitter < QUIET
            slot = self.n % HISTORY
            self.quiet[slot] = 1 if still else 0
            self.jit[slot] = min(255, int(self.jitter / 2))
            if still:
                if 0 < self.burst <= BRIDGE and self.quiet_run > 0:
                    self.quiet_run += self.burst  # a short tremor inside the hold
                self.burst = 0
                self.quiet_run += 1
            else:
                self.burst += 1
                if self.burst == BRIDGE + 1:
                    if self.quiet_run > 0:
                        self.last_run = self.quiet_run
                        self.since_run = self.burst
                    else:
                        self.since_run += self.burst
                    self.quiet_run = 0
                elif self.burst > BRIDGE + 1:
                    self.since_run += 1
            if self.refractory > 0:
                self.refractory -= 1
            bridging = 0 < self.burst <= BRIDGE
            run = self.quiet_run if bridging else self.last_run
            since = self.burst if bridging else self.since_run
            if self.refractory == 0 and abs(m - 1000.0) > RELEASE and run >= MIN_HOLD and since <= GAP_AFTER_HOLD:
                self.record(self.n, run, since)
                self.refractory = REFRACTORY
                self.last_run = 0
                self.quiet_run = 0
                self.burst = BRIDGE + 1
                found = True
            self.n += 1
        return found

    def record(self, i, run, since):
        anchor = max(0, i - since - run)
        hold = i - anchor
        draw_start = -1
        run = 0
        k = anchor - 1
        limit = max(0, anchor - MAX_DRAW, i - HISTORY + 1)
        while k >= limit:
            if self.quiet[k % HISTORY] == 1:
                run += 1
                if run >= PAUSE:
                    draw_start = k + run
                    break
            else:
                run = 0
            k -= 1
        draw = anchor - draw_start if draw_start >= 0 else 0
        setup = 0
        if draw_start >= 0:
            floor = max(0, draw_start - MAX_SETUP, i - HISTORY + 1)
            k = draw_start - 1
            while k >= floor and self.quiet[k % HISTORY] == 1:
                k -= 1
            moved = False
            run = 0
            setup_start = -1
            while k >= floor:
                if self.quiet[k % HISTORY] == 1:
                    run += 1
                    if moved and run >= REST:
                        setup_start = k + run
                        break
                else:
                    run = 0
                    moved = True
                k -= 1
            if setup_start >= 0:
                setup = draw_start - setup_start
        total = sum(self.jit[s % HISTORY] for s in range(anchor, i))
        steady = min(9, (total * 2) // hold // 5) if hold > 0 else 0
        self.shots.append([i // RATE, tenths(draw), tenths(hold), steady, tenths(setup)])


def tenths(samples):
    return (samples * 10 + RATE // 2) // RATE


# ---------------------------------------------------------------- synthetic shots

def synthetic(seed=1):
    """Made-up draw-hand motion: (samples x, y, z, the true shots [(release s, draw s, hold s)])."""
    rnd = random.Random(seed)
    xs, ys, zs, truth = [], [], [], []

    def still(sec, noise=4):
        for _ in range(int(sec * RATE)):
            xs.append(rnd.gauss(0, noise)); ys.append(rnd.gauss(0, noise)); zs.append(1000 + rnd.gauss(0, noise))

    def move(sec, amp=180):
        n = int(sec * RATE)
        for k in range(n):
            a = amp * math.sin(math.pi * k / n) * math.sin(k * 0.9 * 25 / RATE)
            xs.append(a + rnd.gauss(0, 25)); ys.append(rnd.gauss(0, 25)); zs.append(1000 + 0.5 * a + rnd.gauss(0, 25))

    def snap():  # ~0.16 s of the hand flying back
        for v in (2600, -1400, 900, -300):
            for _ in range(RATE // 25):
                xs.append(v); ys.append(rnd.gauss(0, 60)); zs.append(1000 + v * 0.3)

    still(5)  # standing at the line
    for raise_, draw, hold in [(1.4, 2.2, 4.0), (1.8, 1.8, 6.5), (1.2, 2.6, 3.2), (1.6, 2.0, 5.0), (2.0, 1.6, 7.8), (1.5, 2.4, 4.4)]:
        still(1.5)       # nocked, ready
        move(raise_, 120)  # set-up: the hand rising with the bow
        still(0.8)       # set position: a short pause before the draw
        move(draw)       # the draw
        still(hold, 6)   # anchor: aiming and expansion
        truth.append((len(xs) / RATE, draw, hold, raise_ + 0.8))
        snap()           # release
        move(1.2, 400)   # follow-through, lowering the bow
        still(rnd.uniform(15, 25))  # grading on the watch, nocking the next arrow
    return xs, ys, zs, truth


def run_synthetic():
    xs, ys, zs, truth = synthetic()
    det = ShotDetector()
    for k in range(0, len(xs), RATE):  # one batch a second, as on the watch
        det.feed(xs[k:k + RATE], ys[k:k + RATE], zs[k:k + RATE])
    print('true (release s, draw s, hold s, set-up s) vs found [t, draw/10, hold/10, steady, set-up/10]:')
    ok = len(det.shots) == len(truth)
    for i, t in enumerate(truth):
        f = det.shots[i] if i < len(det.shots) else None
        good = (f is not None and abs(f[0] - t[0]) <= 1 and abs(f[1] / 10 - t[1]) <= 1.0 and abs(f[2] / 10 - t[2]) <= 0.5
                and abs(f[4] / 10 - t[3]) <= 1.0)
        ok = ok and good
        print(f'  {t[0]:6.1f} {t[1]:4.1f} {t[2]:4.1f} {t[3]:4.1f}   {f}   {"ok" if good else "OFF"}')
    print('extra shots found:', det.shots[len(truth):])
    return ok


def fit_motion(path):
    """The FIT file's accelerometer resampled to RATE: (xs, ys, zs) in milli-g, and its messages.
    The SensorLogger writes calibrated milli-g in fields 5/6/7 (raw counts 2/3/4), ~100 Hz."""
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import fit_read
    msgs = fit_read.read(path)
    samples = []
    for m in msgs:
        if m['_mesg'] != 'accelerometer_data':
            continue
        base = (m.get(253) or 0) * 1000 + (m.get(0) or 0)
        offs = m.get(1)
        cols = [m.get(k) if m.get(k) is not None else m.get(k - 3) for k in (5, 6, 7)]
        if not isinstance(offs, list):
            offs, cols = [offs], [[c] for c in cols]
        for o, x, y, z in zip(offs, *cols):
            if x is not None:
                samples.append((base + (o or 0), x, y, z))
    samples.sort()
    xs, ys, zs = [], [], []
    if samples:
        t, k, step = samples[0][0], 0, 1000 / RATE
        while t <= samples[-1][0]:
            while k + 1 < len(samples) and samples[k + 1][0] <= t:
                k += 1
            xs.append(samples[k][1]); ys.append(samples[k][2]); zs.append(samples[k][3])
            t += step
    return xs, ys, zs, msgs


def run_fit(path):
    xs, ys, zs, msgs = fit_motion(path)
    det = ShotDetector()
    for k in range(0, len(xs), RATE):
        det.feed(xs[k:k + RATE], ys[k:k + RATE], zs[k:k + RATE])
    recs = [m for m in msgs if m['_mesg'] == 'record']
    t0 = recs[0][253] if recs else 0
    acc0 = next((m[253] for m in msgs if m['_mesg'] == 'accelerometer_data'), t0)
    taps = [(m[253] - t0, m.get('shot')) for m in recs if m.get('shot')]
    # as on the watch: a snap within 0.5 s before to 1.5 s after a tap is the archer's own hand
    # (the FIT marks taps only to the second; LAP / START presses are not marked)
    inputs = sorted({m[253] - t0 for m in recs if m.get('shot') or m.get('grade')})
    kept = [s for s in det.shots if not any(-0.5 <= i - s[0] <= 2.5 for i in inputs)]
    mags = [math.sqrt(x * x + y * y + z * z) for x, y, z in zip(xs, ys, zs)]
    peaks = sorted(((abs(v - 1000), i / RATE) for i, v in enumerate(mags)), reverse=True)[:8]
    print(f'samples at {RATE}/s: {len(xs)} ({len(xs) / RATE:.0f} s); motion starts {acc0 - t0} s after the first record')
    print('snaps found [t s, draw/10, hold/10, steady, set-up/10]:', det.shots)
    print('releases kept (no tap next to them):', kept)
    print('arrow taps (s, arrow):', taps)
    print('largest |magnitude - 1 g| (mg, at s):', [(round(p), round(t, 1)) for p, t in peaks])


if __name__ == '__main__':
    if '--synthetic' in sys.argv:
        sys.exit(0 if run_synthetic() else 1)
    run_fit(sys.argv[1])

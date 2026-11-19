import Toybox.Lang;
import Toybox.Math;

// Finds the shots of an end in the draw hand's accelerometer (100 samples a second, milli-g; the
// watch's 25 Hz stream is smoothed and flattens the short release snap).
//
// What the shakiness of the acceleration shows (checked with a deliberate pause at the set-up
// position, activity 25131021078): the hand moves clearly while the archer hooks and grips (the
// "set") and while the bow is raised; from the set-up position on, the slow, smooth draw barely
// shakes the wrist, so the draw and the anchor are one still stretch, ended by the release snap.
// That stretch is split by the wrist's tilt (the direction of gravity in 0.1 s means):
//   pause   at its start, while the tilt does not move: the set-up position held
//   draw    while the tilt moves
//   anchor  at its end, where the tilt stays within 2 degrees of its last 0.5 s
//
// Per shot: [t (s since the end began), raise (0.1 s), still stretch (0.1 s), steadiness 0-9 (0 =
// stillest), set (0.1 s), still stretch before the anchor (0.1 s), tilt change at anchor (0.1
// degrees), pause (0.1 s), follow-through x, y, z (mm)]. So: set-up = raise + pause, draw = before
// the anchor - pause, anchor = still stretch - before the anchor.
//
// The follow-through is the hand's path over the 0.1 s after the snap, along the watch's own axes:
// acceleration = gravity - reading, with gravity as read just before the snap. A release is
// therefore reported 0.1 s after its snap.
//
// Tuned on real sessions (2 ends x 6 arrows each, activities 25128610129 and 25128765325):
// releases are 450-1850 mg snaps after 2-10 s of stillness; other jolts (lowering the bow, tapping the watch) follow
// shorter stillness. The app ignores snaps next to the archer's own taps and button presses.
// watch/tools/detect_shots.py runs the same algorithm on an exported FIT file.
class ShotDetector {
    static const RATE = 100;           // samples per second
    static const ALPHA = 0.0625;       // jitter smoothing per sample (~0.16 s)
    static const QUIET = 15;           // jitter (mg) below which the hand counts as still (still: 2-14)
    static const RELEASE = 420;        // |magnitude - 1 g| (mg) of the release snap (soft ones: ~450)
    static const MIN_HOLD = 150;       // stillness (samples) needed right before a release: 1.5 s
    static const BRIDGE = 30;          // a tremor up to 0.3 s inside the still stretch does not end it
    static const GAP_AFTER_HOLD = 40;  // the snap must come within 0.4 s of the stillness ending
    static const PAUSE = 50;           // a pause (samples) that marks the start of the draw: 0.5 s
    static const MAX_DRAW = 800;       // look back at most 8 s for the draw's start
    static const REST = 100;           // a rest (samples) before the set-up: 1.0 s
    static const MAX_SETUP = 800;      // look back at most 8 s for the set-up's start
    static const REFRACTORY = 300;     // 3 s between two releases
    static const HISTORY = 3000;       // 30 s of quiet flags kept for looking back
    static const BLOCK = 10;           // the tilt is followed in means of 0.1 s
    static const BLOCKS = 300;         // HISTORY / BLOCK
    static const TILT_COS2 = 0.998782; // cos(2 degrees) squared: the tilt at anchor
    static const PAUSE_COS2 = 0.999695; // cos(1 degree) squared: the tilt's change in 0.5 s in a pause
    static const PAUSE_BLOCKS = 5;     // a pause lasts 0.5 s
    static const RAW = 64;             // raw samples kept for the follow-through
    static const FT_BEFORE = 8;        // its path starts 0.08 s before the snap is seen ...
    static const FT_AFTER = 9;         // ... and ends 0.1 s after it
    static const FT_REST_FROM = 40;    // gravity: the mean reading from 0.4 s ...
    static const FT_REST_TO = 10;      // ... to 0.1 s before the snap

    var lastShot as Array<Number>? = null;
    var lastBack as Number = 0; // samples from the release to the end of the batch it was found in

    hidden var _n as Number = 0;             // samples since the end began
    hidden var _prev as Float = 1000.0;
    hidden var _jitter as Float = 0.0;
    hidden var _quiet as ByteArray = new [HISTORY]b; // 1 = still, ring buffer by sample index
    hidden var _jit as ByteArray = new [HISTORY]b;   // jitter / 2 (mg), for steadiness
    hidden var _quietRun as Number = 0;      // current run of still samples (short tremors bridged)
    hidden var _burst as Number = 0;         // current run of moving samples
    hidden var _lastRun as Number = 0;       // length of the last finished run
    hidden var _sinceRun as Number = 9999;   // samples since that run ended
    hidden var _refractory as Number = 0;
    hidden var _bsum as Array<Number> = [0, 0, 0] as Array<Number>;   // the 0.1 s being summed
    hidden var _bx as Array<Number> = new [BLOCKS] as Array<Number>;  // 0.1 s sums, ring by block index
    hidden var _by as Array<Number> = new [BLOCKS] as Array<Number>;
    hidden var _bz as Array<Number> = new [BLOCKS] as Array<Number>;
    hidden var _rx as Array<Number> = new [RAW] as Array<Number>;     // raw samples, ring by sample index
    hidden var _ry as Array<Number> = new [RAW] as Array<Number>;
    hidden var _rz as Array<Number> = new [RAW] as Array<Number>;
    hidden var _pend as Array<Number>? = null; // the release whose follow-through is still coming in
    hidden var _rel as Number = 0;             // its sample index

    function initialize() {
        for (var b = 0; b < BLOCKS; b++) { _bx[b] = 0; _by[b] = 0; _bz[b] = 0; }
        for (var r = 0; r < RAW; r++) { _rx[r] = 0; _ry[r] = 0; _rz[r] = 0; }
    }

    // A new end: nothing found yet, time starts again.
    function reset() as Void {
        lastShot = null;
        _n = 0;
        _jitter = 0.0;
        _quietRun = 0;
        _burst = 0;
        _lastRun = 0;
        _sinceRun = 9999;
        _refractory = 0;
        _bsum = [0, 0, 0] as Array<Number>;
        _pend = null;
    }

    // Feed a batch of samples. Returns true when a release was found in it.
    function feed(xs as Array<Number>, ys as Array<Number>, zs as Array<Number>) as Boolean {
        var found = false;
        for (var k = 0; k < xs.size(); k++) {
            var x = xs[k].toFloat();
            var y = ys[k].toFloat();
            var z = zs[k].toFloat();
            var m = Math.sqrt(x * x + y * y + z * z).toFloat();
            var d = m - _prev;
            if (d < 0) { d = -d; }
            _prev = m;
            _jitter = _jitter * (1.0 - ALPHA) + d * ALPHA;
            var still = _jitter < QUIET;
            var slot = _n % HISTORY;
            _quiet[slot] = still ? 1 : 0;
            var j = (_jitter / 2).toNumber();
            _jit[slot] = j > 255 ? 255 : j;
            var r = _n % RAW;
            _rx[r] = xs[k];
            _ry[r] = ys[k];
            _rz[r] = zs[k];
            _bsum[0] += xs[k];
            _bsum[1] += ys[k];
            _bsum[2] += zs[k];
            if (_n % BLOCK == BLOCK - 1) {
                var bi = (_n / BLOCK) % BLOCKS;
                _bx[bi] = _bsum[0];
                _by[bi] = _bsum[1];
                _bz[bi] = _bsum[2];
                _bsum = [0, 0, 0] as Array<Number>;
            }

            if (still) {
                if (_burst > 0 && _burst <= BRIDGE && _quietRun > 0) { _quietRun += _burst; } // a tremor
                _burst = 0;
                _quietRun++;
            } else {
                _burst++;
                if (_burst == BRIDGE + 1) {
                    if (_quietRun > 0) {
                        _lastRun = _quietRun;
                        _sinceRun = _burst;
                    } else {
                        _sinceRun += _burst;
                    }
                    _quietRun = 0;
                } else if (_burst > BRIDGE + 1) {
                    _sinceRun++;
                }
            }
            if (_refractory > 0) { _refractory--; }

            var dev = m - 1000.0;
            if (dev < 0) { dev = -dev; }
            var bridging = _burst > 0 && _burst <= BRIDGE;
            var run = bridging ? _quietRun : _lastRun;
            var since = bridging ? _burst : _sinceRun;
            if (_refractory == 0 && dev > RELEASE && run >= MIN_HOLD && since <= GAP_AFTER_HOLD) {
                record(_n, run, since);
                _refractory = REFRACTORY;
                _lastRun = 0;
                _quietRun = 0;
                _burst = BRIDGE + 1;
            }
            if (_pend != null && _n == _rel + FT_AFTER) {
                var shot = _pend as Array<Number>;
                shot.addAll(followThrough());
                lastShot = shot;
                _pend = null;
                lastBack = xs.size() - 1 - k + FT_AFTER;
                found = true;
            }
            _n++;
        }
        return found;
    }

    hidden function record(i as Number, holdRun as Number, since as Number) as Void {
        var anchor = i - since - holdRun; // first still sample of the hold
        if (anchor < 0) { anchor = 0; }
        var hold = i - anchor;
        // the draw: moving samples before the anchor, back to a pause of PAUSE still samples
        var drawStart = -1;
        var run = 0;
        var k = anchor - 1;
        var limit = anchor - MAX_DRAW;
        if (limit < 0) { limit = 0; }
        if (limit < i - HISTORY + 1) { limit = i - HISTORY + 1; }
        while (k >= limit) {
            if (_quiet[k % HISTORY] == 1) {
                run++;
                if (run >= PAUSE) {
                    drawStart = k + run;
                    break;
                }
            } else {
                run = 0;
            }
            k--;
        }
        var draw = drawStart >= 0 ? anchor - drawStart : 0;
        // the set-up: back from the draw over the pause and the moving before it, to a rest of REST
        var setup = 0;
        if (drawStart >= 0) {
            var floor = drawStart - MAX_SETUP;
            if (floor < 0) { floor = 0; }
            if (floor < i - HISTORY + 1) { floor = i - HISTORY + 1; }
            k = drawStart - 1;
            while (k >= floor && _quiet[k % HISTORY] == 1) { k--; } // the pause
            var moved = false;
            run = 0;
            var setupStart = -1;
            while (k >= floor) {
                if (_quiet[k % HISTORY] == 1) {
                    run++;
                    if (moved && run >= REST) {
                        setupStart = k + run;
                        break;
                    }
                } else {
                    run = 0;
                    moved = true;
                }
                k--;
            }
            if (setupStart >= 0) { setup = drawStart - setupStart; }
        }
        // steadiness: average jitter while holding
        var sum = 0;
        for (var s = anchor; s < i; s++) { sum += _jit[s % HISTORY]; }
        var steady = hold > 0 ? (sum * 2) / hold / 5 : 0;
        if (steady > 9) { steady = 9; }
        var split = anchor(i, hold);
        _pend = [i / RATE, tenths(draw), tenths(hold), steady, tenths(setup), tenths(split[0]), split[1], tenths(split[2])] as Array<Number>;
        _rel = i;
    }

    // The sum of the 0.1 s blocks a..b.
    hidden function blockSum(a as Number, b as Number) as Array<Float> {
        var x = 0.0;
        var y = 0.0;
        var z = 0.0;
        for (var k = a; k <= b; k++) {
            var bi = k % BLOCKS;
            x += _bx[bi];
            y += _by[bi];
            z += _bz[bi];
        }
        return [x, y, z] as Array<Float>;
    }

    // The still stretch split by the wrist's tilt: [samples before the anchor, the tilt's change at
    // anchor in 0.1 degrees, samples of pause at its start].
    hidden function anchor(i as Number, hold as Number) as Array<Number> {
        var last = (i - 15) / BLOCK - 1; // the last whole 0.1 s ending 0.15 s before the snap
        var first = (i - hold) / BLOCK + 1;
        if (first < last - BLOCKS + 2) { first = last - BLOCKS + 2; }
        if (first < 0) { first = 0; }
        if (last - 4 < first) { return [0, 0, 0] as Array<Number>; }
        var fin = blockSum(last - 4, last);
        var ff = fin[0] * fin[0] + fin[1] * fin[1] + fin[2] * fin[2];
        var b = last;
        while (b - 1 >= first) {
            var bi = (b - 1) % BLOCKS;
            var ux = _bx[bi].toFloat();
            var uy = _by[bi].toFloat();
            var uz = _bz[bi].toFloat();
            var dot = ux * fin[0] + uy * fin[1] + uz * fin[2];
            if (dot <= 0 || dot * dot < TILT_COS2 * (ux * ux + uy * uy + uz * uz) * ff) { break; }
            b--;
        }
        var drift = 0;
        if (last - b >= 5) {
            var u = blockSum(b, b + 4);
            var c = (u[0] * fin[0] + u[1] * fin[1] + u[2] * fin[2]) / Math.sqrt((u[0] * u[0] + u[1] * u[1] + u[2] * u[2]) * ff);
            if (c > 1.0) { c = 1.0; }
            drift = (Math.toDegrees(Math.acos(c)) * 10 + 0.5).toNumber();
        }
        // the draw: back from the anchor while the tilt moves, to a pause of 0.5 s (tilt change over
        // 0.5 s under 1 degree) or to the start of the still stretch
        var flat = 0;
        var start = first;
        for (var k = b - 1 - PAUSE_BLOCKS; k >= first; k--) {
            var ui = k % BLOCKS;
            var wi = (k + PAUSE_BLOCKS) % BLOCKS;
            var ax = _bx[ui].toFloat();
            var ay = _by[ui].toFloat();
            var az = _bz[ui].toFloat();
            var cx = _bx[wi].toFloat();
            var cy = _by[wi].toFloat();
            var cz = _bz[wi].toFloat();
            var d = ax * cx + ay * cy + az * cz;
            if (d > 0 && d * d >= PAUSE_COS2 * (ax * ax + ay * ay + az * az) * (cx * cx + cy * cy + cz * cz)) {
                flat++;
                if (flat >= PAUSE_BLOCKS) {
                    start = k + 2 * PAUSE_BLOCKS - 1;
                    break;
                }
            } else {
                flat = 0;
            }
        }
        var settle = b * BLOCK - (i - hold);
        if (settle < 0) { settle = 0; }
        var pause = 0;
        if (start > first) {
            pause = start * BLOCK - (i - hold);
            if (pause < 0) { pause = 0; }
            if (pause > settle) { pause = settle; }
        }
        return [settle, drift, pause] as Array<Number>;
    }

    // The hand's path over the 0.1 s after the snap, in mm along the watch's x, y and z.
    hidden function followThrough() as Array<Number> {
        var i = _rel;
        if (i < FT_REST_FROM) { return [0, 0, 0] as Array<Number>; }
        var gx = 0.0;
        var gy = 0.0;
        var gz = 0.0;
        for (var k = i - FT_REST_FROM; k < i - FT_REST_TO; k++) {
            var r = k % RAW;
            gx += _rx[r];
            gy += _ry[r];
            gz += _rz[r];
        }
        var cnt = FT_REST_FROM - FT_REST_TO;
        gx /= cnt;
        gy /= cnt;
        gz /= cnt;
        var f = 9.80665 / 1000 / RATE; // mg -> m/s per sample
        var vx = 0.0;
        var vy = 0.0;
        var vz = 0.0;
        var px = 0.0;
        var py = 0.0;
        var pz = 0.0;
        for (var k = i - FT_BEFORE; k <= i + FT_AFTER; k++) {
            var r = k % RAW;
            vx += (gx - _rx[r]) * f;
            vy += (gy - _ry[r]) * f;
            vz += (gz - _rz[r]) * f;
            px += vx * 1000 / RATE;
            py += vy * 1000 / RATE;
            pz += vz * 1000 / RATE;
        }
        return [Math.floor(px + 0.5).toNumber(), Math.floor(py + 0.5).toNumber(), Math.floor(pz + 0.5).toNumber()] as Array<Number>;
    }

    hidden function tenths(samples as Number) as Number {
        return (samples * 10 + RATE / 2) / RATE;
    }
}

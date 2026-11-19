import Toybox.Lang;
import Toybox.Math;

// Finds the shots of an end in the draw hand's accelerometer (100 samples a second, milli-g; the
// watch's 25 Hz stream is smoothed and flattens the short release snap):
//   set-up  the hand rising with the bow and settling (from the last rest up to the draw)
//   draw    the hand moving back (after a pause, up to the anchor)
//   anchor  the hand still: aiming and expansion (the "hold")
//   release a sharp snap of the hand right after that stillness
// Per shot: [t (s since the end began), draw (0.1 s), hold (0.1 s), steadiness 0-9 (0 = stillest),
// set-up (0.1 s)].
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
    static const BRIDGE = 10;          // a tremor up to 0.1 s inside a hold does not end it
    static const GAP_AFTER_HOLD = 40;  // the snap must come within 0.4 s of the stillness ending
    static const PAUSE = 50;           // a pause (samples) that marks the start of the draw: 0.5 s
    static const MAX_DRAW = 800;       // look back at most 8 s for the draw's start
    static const REST = 100;           // a rest (samples) before the set-up: 1.0 s
    static const MAX_SETUP = 800;      // look back at most 8 s for the set-up's start
    static const REFRACTORY = 300;     // 3 s between two releases
    static const HISTORY = 3000;       // 30 s of quiet flags kept for looking back

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

    function initialize() {
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
                lastBack = xs.size() - 1 - k;
                _refractory = REFRACTORY;
                _lastRun = 0;
                _quietRun = 0;
                _burst = BRIDGE + 1;
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
        lastShot = [i / RATE, tenths(draw), tenths(hold), steady, tenths(setup)] as Array<Number>;
    }

    hidden function tenths(samples as Number) as Number {
        return (samples * 10 + RATE / 2) / RATE;
    }
}

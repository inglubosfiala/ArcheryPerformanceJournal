import Toybox.Application;
import Toybox.Lang;

// The end being shot: the graded shots so far and the step of the shot being graded.
// A shot is [arrowNo, m, s, hr, t]: t is the second of the heart-rate trace at the arrow tap.
// Saved on every change, so leaving the app loses nothing.
//
// The trace: one heart-rate sample per second while the end is shot, from PRE_ROLL seconds
// before the first arrow's tap to the last arrow's grade. Walking to the target is not in it.
class EndState {
    static const PRE_ROLL = 30;
    static const TRACE_MAX = 900; // 15 minutes
    // trace characters: a change of -21..+21 beats; the QR alphanumeric set without space and '.'
    static const DELTAS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-/:";

    static const STEP_ARROW = 0;
    static const STEP_M = 1;
    static const STEP_S = 2;

    var endNo as Number = 1;
    var shots as Array<Array<Number>> = [] as Array<Array<Number>>;
    var step as Number = STEP_ARROW;
    var pendingNo as Number = 0;
    var pendingM as Number = 0;
    var pendingHr as Number = 0;
    var perEnd as Number = 6;
    var owned as Number = 6;
    var trace as Array<Number> = [] as Array<Number>;
    var pendingT as Number = -1;

    function initialize() {
        load();
    }

    function load() as Void {
        var d = Application.Storage.getValue("end");
        if (d instanceof Dictionary) {
            endNo = d["endNo"] as Number;
            shots = d["shots"] as Array<Array<Number>>;
            step = d["step"] as Number;
            pendingNo = d["pendingNo"] as Number;
            pendingM = d["pendingM"] as Number;
            pendingHr = d["pendingHr"] as Number;
            var t = d["trace"];
            if (t instanceof Array) { trace = t as Array<Number>; }
            var pt = d["pendingT"];
            if (pt instanceof Number) { pendingT = pt; }
        }
        var p = Application.Storage.getValue("perEnd");
        if (p instanceof Number) { perEnd = p; }
        var o = Application.Storage.getValue("owned");
        if (o instanceof Number) { owned = o; }
        if (owned < perEnd) { owned = perEnd; }
    }

    function save() as Void {
        Application.Storage.setValue("end", {
            "endNo" => endNo,
            "shots" => shots,
            "step" => step,
            "pendingNo" => pendingNo,
            "pendingM" => pendingM,
            "pendingHr" => pendingHr,
            "pendingT" => pendingT,
            "trace" => trace
        });
        Application.Storage.setValue("perEnd", perEnd);
        Application.Storage.setValue("owned", owned);
    }

    function isComplete() as Boolean {
        return shots.size() >= perEnd;
    }

    // Arrow numbers not graded yet in this end, lowest first.
    function unusedNumbers() as Array<Number> {
        var out = [] as Array<Number>;
        for (var n = 1; n <= owned; n++) {
            var used = false;
            for (var i = 0; i < shots.size(); i++) {
                if (shots[i][0] == n) { used = true; break; }
            }
            if (!used) { out.add(n); }
        }
        return out;
    }

    // True from the first arrow's tap on: the trace keeps everything from then.
    hidden function started() as Boolean {
        return shots.size() > 0 || pendingT >= 0;
    }

    // One heart-rate sample (0: none), called every second while the app runs.
    function sample(hr as Number) as Void {
        if (isComplete() || trace.size() >= TRACE_MAX) { return; }
        trace.add(hr);
        if (!started() && trace.size() > PRE_ROLL) { trace = trace.slice(trace.size() - PRE_ROLL, null); }
    }

    function chooseArrow(no as Number, hr as Number) as Void {
        pendingNo = no;
        pendingHr = hr;
        pendingT = trace.size();
        step = STEP_M;
        save();
    }

    function chooseM(m as Number, hr as Number) as Void {
        pendingM = m;
        if (pendingHr == 0) { pendingHr = hr; }
        if (pendingT < 0) { pendingT = trace.size(); } // the arrow number was picked by itself
        step = STEP_S;
        save();
    }

    // Completes the shot. The last remaining arrow number is picked without asking.
    function chooseS(s as Number) as Void {
        shots.add([pendingNo, pendingM, s, pendingHr, pendingT < 0 ? 0 : pendingT]);
        resetPending();
        autoPick();
        save();
    }

    hidden function resetPending() as Void {
        pendingNo = 0;
        pendingM = 0;
        pendingHr = 0;
        pendingT = -1;
        step = STEP_ARROW;
    }

    hidden function autoPick() as Void {
        if (isComplete()) { return; }
        var left = unusedNumbers();
        if (left.size() == 1) {
            pendingNo = left[0];
            step = STEP_M;
        }
    }

    // One step back; at the arrow step it removes the last shot. False when there is nothing to undo.
    function back() as Boolean {
        if (step == STEP_S) {
            step = STEP_M;
        } else if (step == STEP_M && pendingNo != 0 && unusedNumbers().size() > 1) {
            resetPending();
        } else if (shots.size() > 0) {
            shots = shots.slice(0, shots.size() - 1);
            resetPending();
        } else {
            return false;
        }
        save();
        return true;
    }

    function undoLast() as Void {
        if (shots.size() > 0) {
            shots = shots.slice(0, shots.size() - 1);
        }
        resetPending();
        save();
    }

    // The end's average M and S (0.0 when nothing is graded), for the activity's lap.
    function averages() as Array<Float> {
        var m = 0;
        var s = 0;
        var nm = 0;
        var ns = 0;
        for (var i = 0; i < shots.size(); i++) {
            if (shots[i][1] > 0) { m += shots[i][1]; nm++; }
            if (shots[i][2] > 0) { s += shots[i][2]; ns++; }
        }
        return [nm > 0 ? m.toFloat() / nm : 0.0, ns > 0 ? s.toFloat() / ns : 0.0] as Array<Float>;
    }

    function nextEnd() as Void {
        endNo++;
        shots = [] as Array<Array<Number>>;
        trace = [] as Array<Number>;
        resetPending();
        autoPick();
        save();
    }

    // A new round: end 1, nothing graded, the arrows per end and numbered arrows chosen.
    function newRound(arrowsPerEnd as Number, numbered as Number) as Void {
        perEnd = arrowsPerEnd;
        owned = numbered < perEnd ? perEnd : numbered;
        endNo = 1;
        shots = [] as Array<Array<Number>>;
        trace = [] as Array<Number>;
        resetPending();
        autoPick();
        save();
    }

    function setPerEnd(n as Number) as Void {
        perEnd = n;
        if (owned < perEnd) { owned = perEnd; }
        save();
    }

    function setOwned(n as Number) as Void {
        owned = n < perEnd ? perEnd : n;
        save();
    }

    // The watch code (journal: public/js/app/watchCode.js):
    //   APJ2.E<end>.<arrow>...[.H<step><first hr><changes>]
    // arrow: number (2) . M (1) . S (1) . t (3, the second of the trace at the shot), in arrow-number
    // order. H: the trace in bins of <step> seconds (1 digit), the first bin's heart rate (3 digits)
    // and one character per further bin: its change, -21..+21 (see DELTAS).
    function payload() as String {
        var sorted = shots.slice(0, null);
        for (var i = 1; i < sorted.size(); i++) {
            var cur = sorted[i];
            var j = i - 1;
            while (j >= 0 && sorted[j][0] > cur[0]) {
                sorted[j + 1] = sorted[j];
                j--;
            }
            sorted[j + 1] = cur;
        }
        var text = "APJ2.E" + endNo.toString();
        for (var k = 0; k < sorted.size(); k++) {
            var a = sorted[k];
            var t = a.size() > 4 ? a[4] : 0;
            if (t < 0) { t = 0; }
            if (t > 999) { t = 999; }
            text += "." + a[0].format("%02d") + a[1].toString() + a[2].toString() + t.format("%03d");
        }
        return text + traceText();
    }

    // The trace binned to at most about 60 points (bins of 1-9 s); "" when there is no heart rate.
    hidden function traceText() as String {
        var n = trace.size();
        if (n == 0) { return ""; }
        var step = (n + 59) / 60;
        if (step < 1) { step = 1; }
        if (step > 9) { step = 9; }
        var bins = [] as Array<Number>;
        var last = 0;
        for (var b = 0; b * step < n; b++) {
            var sum = 0;
            var cnt = 0;
            for (var i = b * step; i < n && i < (b + 1) * step; i++) {
                if (trace[i] >= 30 && trace[i] <= 250) {
                    sum += trace[i];
                    cnt++;
                }
            }
            // a bin without a reading repeats the one before
            var v = cnt > 0 ? (sum + cnt / 2) / cnt : last;
            bins.add(v);
            if (v > 0) { last = v; }
        }
        // leading bins without a reading take the first reading
        var first = 0;
        for (var i = 0; i < bins.size(); i++) {
            if (bins[i] > 0) { first = bins[i]; break; }
        }
        if (first == 0) { return ""; }
        var text = ".H" + step.toString() + first.format("%03d");
        var prev = first;
        for (var i = 1; i < bins.size(); i++) {
            var v = bins[i] > 0 ? bins[i] : prev;
            var d = v - prev;
            if (d > 21) { d = 21; }
            if (d < -21) { d = -21; }
            prev += d; // what the journal reads back
            text += DELTAS.substring(d + 21, d + 22);
        }
        return text;
    }
}

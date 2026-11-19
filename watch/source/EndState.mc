import Toybox.Application;
import Toybox.Lang;

// The end being shot: the graded shots so far and the step of the shot being graded.
// A shot is [arrowNo, m, s, hr, t]: t is the second of the heart-rate trace at the arrow tap.
// Saved on every change, so leaving the app loses nothing.
//
// The trace: one heart-rate sample per second while the end is shot, from its start (START, or LAP
// after the rest) to its close (LAP, or the last arrow's grade). Resting and walking to the target
// are not in it. Grading is optional: an end closed without grades still has its trace.
class EndState {
    static const TRACE_MAX = 900; // 15 minutes
    // trace characters: a change of -21..+21 beats; the QR alphanumeric set without space and '.'
    static const PAYLOAD_MAX = 390; // what the QR code (version 10, level L) holds
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
    var closed as Boolean = false; // the end was closed (LAP or its last arrow)
    // the releases kept in the end: [t s, draw 0.1 s, hold 0.1 s, steadiness 0-9, set-up 0.1 s, arrow no]
    // (arrow 0: none selected at the release yet; the next arrow picked within 30 s takes it)
    var detected as Array<Array<Number>> = [] as Array<Array<Number>>;
    // the round so far, for the stop screen: closed ends' arrows and grade sums
    var roundEnds as Number = 0;
    var roundArrows as Number = 0;
    var roundM as Array<Number> = [0, 0] as Array<Number>; // sum, count
    var roundS as Array<Number> = [0, 0] as Array<Number>;
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

    // One heart-rate sample (0: none), called every second while the app runs.
    function sample(hr as Number) as Void {
        if (closed || trace.size() >= TRACE_MAX) { return; }
        trace.add(hr);
    }

    // A release the app kept, for the arrow selected at it (0: the next one picked). The arrow
    // goes in at [5], before the detector's settle, tilt change and follow-through.
    function addDetected(shot as Array<Number>, arrowNo as Number) as Void {
        var d = shot.slice(0, 5);
        d.add(arrowNo);
        d.addAll(shot.slice(5, null));
        detected.add(d);
    }

    function chooseArrow(no as Number, hr as Number) as Void {
        // shot first, picked after: the latest release without an arrow, up to 30 s ago, is this one
        for (var i = detected.size() - 1; i >= 0; i--) {
            var d = detected[i];
            if (trace.size() - d[0] > 30) { break; }
            if (d[5] == 0) {
                d[5] = no;
                break;
            }
        }
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

    // LAP: the end is done; its arrows count into the round.
    function closeEnd() as Void {
        if (closed) { return; }
        // an arrow picked but not (fully) graded keeps its number and time, without the missing grades
        if (pendingT >= 0 && pendingNo != 0) {
            shots.add([pendingNo, step == STEP_S ? pendingM : 0, 0, pendingHr, pendingT]);
        }
        resetPending();
        closed = true;
        roundEnds++;
        roundArrows += shots.size();
        for (var i = 0; i < shots.size(); i++) {
            if (shots[i][1] > 0) { roundM[0] += shots[i][1]; roundM[1]++; }
            if (shots[i][2] > 0) { roundS[0] += shots[i][2]; roundS[1]++; }
        }
        save();
    }

    // Average M and S of the round, the end being shot included (0.0 when nothing is graded).
    function roundAverages() as Array<Float> {
        var m = roundM[0];
        var nm = roundM[1];
        var s = roundS[0];
        var ns = roundS[1];
        if (!closed) {
            for (var i = 0; i < shots.size(); i++) {
                if (shots[i][1] > 0) { m += shots[i][1]; nm++; }
                if (shots[i][2] > 0) { s += shots[i][2]; ns++; }
            }
        }
        return [nm > 0 ? m.toFloat() / nm : 0.0, ns > 0 ? s.toFloat() / ns : 0.0] as Array<Float>;
    }

    function nextEnd() as Void {
        closed = false;
        detected = [] as Array<Array<Number>>;
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
        closed = false;
        detected = [] as Array<Array<Number>>;
        roundEnds = 0;
        roundArrows = 0;
        roundM = [0, 0] as Array<Number>;
        roundS = [0, 0] as Array<Number>;
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
    //   APJ5.E<end>.<arrow>...[.D<release>...][.H<step><first hr><changes>]
    // arrow: number (2) . M (1) . S (1) . t (3, the second of the trace at the shot), in arrow-number
    // order. H: the trace in bins of <step> seconds (1 digit), the first bin's heart rate (3 digits)
    // and one character per further bin: its change, -21..+21 (see DELTAS).
    function payload() as String {
        var text = payloadText(true);
        // too long for the code (many arrows): without the releases' anchor and follow-through
        return text.length() > PAYLOAD_MAX ? payloadText(false) : text;
    }

    hidden function payloadText(extras as Boolean) as String {
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
        var text = "APJ5.E" + endNo.toString();
        for (var k = 0; k < sorted.size(); k++) {
            var a = sorted[k];
            var t = a.size() > 4 ? a[4] : 0;
            if (t < 0) { t = 0; }
            if (t > 999) { t = 999; }
            text += "." + a[0].format("%02d") + a[1].toString() + a[2].toString() + t.format("%03d");
        }
        // the releases kept: D, t (3), arrow (2, 00 none), set-up (2, 0.1 s), draw (2, 0.1 s),
        // hold (3, 0.1 s), steadiness (1); then, when they fit, one character each (DELTAS, 0-42):
        // settle (0.2 s), tilt change at anchor (0.1 degrees), follow-through x, y, z (3 mm, 21 = 0)
        for (var d = 0; d < detected.size(); d++) {
            var x = detected[d];
            var su = x[4] > 99 ? 99 : x[4];
            var dr = x[1] > 99 ? 99 : x[1];
            var ho = x[2] > 999 ? 999 : x[2];
            var tt = x[0] > 999 ? 999 : x[0];
            var no = x.size() > 5 ? x[5] : 0;
            text += ".D" + tt.format("%03d") + no.format("%02d") + su.format("%02d") + dr.format("%02d") + ho.format("%03d") + x[3].toString();
            if (extras && x.size() > 10) {
                text += code43((x[6] + 1) / 2) + code43(x[7]);
                for (var c = 8; c <= 10; c++) {
                    var mm = x[c];
                    text += code43((mm >= 0 ? mm + 1 : mm - 1) / 3 + 21);
                }
            }
        }
        return text + traceText();
    }

    // One character for 0-42 (clamped).
    hidden function code43(v as Number) as String {
        if (v < 0) { v = 0; }
        if (v > 42) { v = 42; }
        return DELTAS.substring(v, v + 1);
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

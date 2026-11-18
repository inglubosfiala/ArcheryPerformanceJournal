import Toybox.Application;
import Toybox.Lang;

// The end being shot: the graded shots so far and the step of the shot being graded.
// A shot is [arrowNo, m, s, hr]. Saved on every change, so leaving the app loses nothing.
class EndState {
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
            "pendingHr" => pendingHr
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

    function chooseArrow(no as Number, hr as Number) as Void {
        pendingNo = no;
        pendingHr = hr;
        step = STEP_M;
        save();
    }

    function chooseM(m as Number, hr as Number) as Void {
        pendingM = m;
        if (pendingHr == 0) { pendingHr = hr; }
        step = STEP_S;
        save();
    }

    // Completes the shot. The last remaining arrow number is picked without asking.
    function chooseS(s as Number) as Void {
        shots.add([pendingNo, pendingM, s, pendingHr]);
        resetPending();
        autoPick();
        save();
    }

    hidden function resetPending() as Void {
        pendingNo = 0;
        pendingM = 0;
        pendingHr = 0;
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

    function nextEnd() as Void {
        endNo++;
        shots = [] as Array<Array<Number>>;
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

    // The watch code: APJ1.E<end>.<arrow(2) m(1) s(1) hr(3)>... in arrow-number order.
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
        var text = "APJ1.E" + endNo.toString();
        for (var k = 0; k < sorted.size(); k++) {
            var a = sorted[k];
            var hr = a[3];
            if (hr < 0 || hr > 999) { hr = 0; }
            text += "." + a[0].format("%02d") + a[1].toString() + a[2].toString() + hr.format("%03d");
        }
        return text;
    }
}

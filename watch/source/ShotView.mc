import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

const COLOR_M = 0xFFAA00;
const COLOR_S = 0x33AAFF;
const COLOR_ARROW = 0xFFFFFF;
const COLOR_CELL = 0x262626;
const COLOR_DIM = 0x8C8C8C;
const COLOR_GO = 0x2ECC71;

// One shot is graded in three taps: which arrow, M (1-5), S (1-5). The header shows the end, the
// shot and the end's time; a tap on it (or hold UP) opens the menu.
// With grading off (setup) nothing is tapped: the screen shows the end's time, the releases found,
// the heart rate and the last release's times.
class ShotView extends WatchUi.View {
    // tap zones of the current step: [x, y, w, h, value]
    var cells as Array<Array<Number>> = [] as Array<Array<Number>>;

    function initialize() {
        View.initialize();
    }

    function options() as Array<Number> {
        var st = endState();
        if (st.step == EndState.STEP_ARROW) { return st.unusedNumbers(); }
        return [1, 2, 3, 4, 5] as Array<Number>;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var st = endState();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        if (!st.grading) {
            drawTiming(dc, st, w, h);
            return;
        }

        var shotNo = st.shots.size() + 1;
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 9) / 100, Graphics.FONT_XTINY,
            "End " + st.endNo.toString() + " · " + (shotNo > st.perEnd ? st.perEnd : shotNo).toString() + "/" + st.perEnd.toString()
                + " · " + clock(app().phaseSeconds()),
            Graphics.TEXT_JUSTIFY_CENTER);

        var title;
        var color;
        if (st.step == EndState.STEP_ARROW) {
            title = "Arrow";
            color = COLOR_ARROW;
        } else if (st.step == EndState.STEP_M) {
            title = "#" + st.pendingNo.toString() + "  M · mental";
            color = COLOR_M;
        } else {
            title = "#" + st.pendingNo.toString() + "  M" + st.pendingM.toString() + "  S · cycle";
            color = COLOR_S;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 17) / 100, Graphics.FONT_SMALL, title, Graphics.TEXT_JUSTIFY_CENTER);

        cells = drawGrid(dc, options(), -1, color);

        // the last graded shot and the last shot the detector timed (draw + anchor), as a reminder
        var line = "";
        if (st.shots.size() > 0) {
            var a = st.shots[st.shots.size() - 1];
            line = "#" + a[0].toString() + " M" + a[1].toString() + " S" + a[2].toString();
        }
        var timed = app().lastTimed;
        if (timed != null) {
            var ts = timed as Array<Number>;
            // draw + anchor (the still stretch split by the tilt); older: raise + still stretch
            var first = ts.size() > 7 ? ts[5] - ts[7] : ts[1];
            var second = ts.size() > 7 ? ts[2] - ts[5] : ts[2];
            line += (line.length() > 0 ? " · " : "") + secs(first) + "+" + secs(second) + "s";
        }
        if (line.length() > 0) {
            dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 87) / 100, Graphics.FONT_XTINY, line, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // Timing only: end and its time, the number of releases, heart rate, the last release's phases.
    hidden function drawTiming(dc as Graphics.Dc, st as EndState, w as Number, h as Number) as Void {
        cells = [] as Array<Array<Number>>;
        var mid = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 12) / 100, Graphics.FONT_XTINY, "End " + st.endNo.toString() + " · timing", mid);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 26) / 100, Graphics.FONT_MEDIUM, clock(app().phaseSeconds()), mid);

        var n = st.detected.size();
        dc.setColor(COLOR_GO, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 47) / 100, Graphics.FONT_NUMBER_HOT, n.toString(), mid);
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 63) / 100, Graphics.FONT_XTINY, n == 1 ? "shot" : "shots", mid);

        var hr = app().heartRate();
        dc.setColor(COLOR_M, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 73) / 100, Graphics.FONT_SMALL, hr > 0 ? hr.toString() + " bpm" : "-- bpm", mid);

        var timed = app().lastTimed;
        if (timed != null) {
            var ts = timed as Array<Number>;
            if (ts.size() > 7) {
                dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
                dc.drawText(w / 2, (h * 84) / 100, Graphics.FONT_XTINY,
                    "draw " + secs(ts[5] - ts[7]) + " · anchor " + secs(ts[2] - ts[5]), mid);
            }
        }
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 92) / 100, Graphics.FONT_XTINY, "LAP: end", mid);
    }

    // 0.1 s as "2.1"
    hidden function secs(tenths as Number) as String {
        return (tenths / 10).toString() + "." + (tenths % 10).toString();
    }

    function valueAt(x as Number, y as Number) as Number {
        return cellValueAt(cells, x, y);
    }
}

class ShotDelegate extends KeyedDelegate {
    hidden var _view as ShotView;

    function initialize(view as ShotView) {
        KeyedDelegate.initialize();
        _view = view;
    }

    hidden function choose(v as Number) as Void {
        var st = endState();
        if (v == 0 || !st.grading) { return; }
        if (st.step == EndState.STEP_ARROW) {
            st.chooseArrow(v, app().heartRate());
            app().recorder.markArrow(v);
        } else if (st.step == EndState.STEP_M) {
            if (st.pendingT < 0) { app().recorder.markArrow(st.pendingNo); } // picked by itself
            st.chooseM(v, app().heartRate());
        } else {
            app().recorder.markGrade(st.pendingM, v);
            st.chooseS(v);
            if (st.isComplete()) {
                // the last arrow of the end: closed as with LAP
                app().closeEnd();
                return;
            }
            buzz();
        }
        WatchUi.requestUpdate();
    }

    function onTouch(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
        if (!endState().grading) { return true; } // timing only: nothing to tap
        // the header ("End 2 · 1/6 · 0:42") opens the menu
        if (xy[1] < (System.getDeviceSettings().screenHeight * 22) / 100) {
            openMenu();
            return true;
        }
        choose(_view.valueAt(xy[0], xy[1]));
        return true;
    }

    // START: the stop screen
    function onSelect() as Boolean {
        app().pauseRound();
        return true;
    }

    // LAP: close the end
    function onBack() as Boolean {
        app().closeEnd();
        return true;
    }

    function onMenu() as Boolean {
        if (endState().grading) { openMenu(); }
        return true;
    }
}

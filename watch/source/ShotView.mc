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

        // the last graded shot, as a reminder
        if (st.shots.size() > 0) {
            var a = st.shots[st.shots.size() - 1];
            dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 87) / 100, Graphics.FONT_XTINY,
                "last #" + a[0].toString() + "  M" + a[1].toString() + " S" + a[2].toString() + (a[3] > 0 ? "  HR" + a[3].toString() : ""),
                Graphics.TEXT_JUSTIFY_CENTER);
        }
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
        if (v == 0) { return; }
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

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
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
        openMenu();
        return true;
    }
}

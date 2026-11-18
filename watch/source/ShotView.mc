import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

const COLOR_M = 0xFFAA00;
const COLOR_S = 0x33AAFF;
const COLOR_ARROW = 0xFFFFFF;
const COLOR_CELL = 0x262626;
const COLOR_DIM = 0x8C8C8C;

// One shot is graded in three taps: which arrow, M (1-5), S (1-5).
class ShotView extends WatchUi.View {
    // tap zones of the current step: [x, y, w, h, value]
    var cells as Array<Array<Number>> = [] as Array<Array<Number>>;
    // highlighted cell when using the buttons, -1 when touch is used
    var sel as Number = -1;

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
            "End " + st.endNo.toString() + " · shot " + (shotNo > st.perEnd ? st.perEnd : shotNo).toString() + "/" + st.perEnd.toString(),
            Graphics.TEXT_JUSTIFY_CENTER);

        if (st.isComplete()) {
            cells = [] as Array<Array<Number>>;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 - 30, Graphics.FONT_MEDIUM, "End complete", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 + 30, Graphics.FONT_SMALL, "Tap for code", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

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

        var opts = options();
        if (sel >= opts.size()) { sel = opts.size() - 1; }
        cells = drawGrid(dc, opts, sel, color);

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

    function selectedValue() as Number {
        if (sel < 0 || sel >= cells.size()) { return 0; }
        return cells[sel][4];
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
        } else if (st.step == EndState.STEP_M) {
            st.chooseM(v, app().heartRate());
        } else {
            st.chooseS(v);
            buzz();
            if (st.isComplete()) {
                showCode();
                return;
            }
        }
        if (_view.sel >= 0) { _view.sel = 0; }
        WatchUi.requestUpdate();
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        if (endState().isComplete()) {
            showCode();
            return true;
        }
        var xy = evt.getCoordinates();
        // the header ("End 2 · shot 1/6") opens the menu
        if (xy[1] < (System.getDeviceSettings().screenHeight * 22) / 100) {
            openMenu();
            return true;
        }
        _view.sel = -1;
        choose(_view.valueAt(xy[0], xy[1]));
        return true;
    }

    function onSelect() as Boolean {
        if (endState().isComplete()) {
            showCode();
            return true;
        }
        if (_view.sel < 0) {
            _view.sel = 0;
            WatchUi.requestUpdate();
            return true;
        }
        choose(_view.selectedValue());
        return true;
    }

    hidden function move(d as Number) as Void {
        var n = _view.cells.size();
        if (n == 0) { return; }
        _view.sel = _view.sel < 0 ? 0 : (_view.sel + d + n) % n;
        WatchUi.requestUpdate();
    }

    function onNextPage() as Boolean {
        move(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        move(-1);
        return true;
    }

    function onBack() as Boolean {
        if (endState().back()) {
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    function onMenu() as Boolean {
        openMenu();
        return true;
    }
}

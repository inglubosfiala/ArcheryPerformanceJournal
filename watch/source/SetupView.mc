import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

const PER_END_CHOICES = [3, 4, 5, 6, 8, 12];

const GRADING_ON = 1;
const GRADING_OFF = 2;

// The setup (UP on the start screen): grade the shots or only time them; with grading, how many
// arrows per end, then how many numbered arrows are shot with (the arrow picker offers 1..that).
// Then back to the start screen.
class SetupView extends WatchUi.View {
    var stage as Number = -1; // -1: grading on/off, 0: arrows per end, 1: numbered arrows
    var perEnd as Number = 6;
    var cells as Array<Array<Number>> = [] as Array<Array<Number>>;
    var sel as Number = 0;

    function initialize() {
        View.initialize();
        perEnd = endState().perEnd;
        sel = endState().grading ? 0 : 1;
    }

    function options() as Array<Number> {
        if (stage < 0) { return [GRADING_ON, GRADING_OFF] as Array<Number>; }
        if (stage == 0) { return PER_END_CHOICES as Array<Number>; }
        var out = [] as Array<Number>;
        var top = perEnd > 12 ? perEnd : 12;
        for (var n = perEnd; n <= top; n++) { out.add(n); }
        return out;
    }

    function indexOf(opts as Array<Number>, v as Number) as Number {
        for (var i = 0; i < opts.size(); i++) {
            if (opts[i] == v) { return i; }
        }
        return 0;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 9) / 100, Graphics.FONT_XTINY,
            stage < 0 ? "Setup" : stage == 0 ? "Grading on" : perEnd.toString() + " arrows per end", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 17) / 100, Graphics.FONT_SMALL,
            stage < 0 ? "Grade the shots?" : stage == 0 ? "Arrows per end" : "Numbered arrows", Graphics.TEXT_JUSTIFY_CENTER);

        var opts = options();
        if (sel >= opts.size()) { sel = opts.size() - 1; }
        if (stage < 0) {
            drawChoice(dc, w, h);
            return;
        }
        cells = drawGrid(dc, opts, sel, Graphics.COLOR_WHITE);
    }

    // Two wide buttons: grade each shot, or only time the shots.
    hidden function drawChoice(dc as Graphics.Dc, w as Number, h as Number) as Void {
        var bw = (w * 66) / 100;
        var bh = (h * 22) / 100;
        var x = (w - bw) / 2;
        cells = [[x, (h * 30) / 100, bw, bh, GRADING_ON], [x, (h * 57) / 100, bw, bh, GRADING_OFF]] as Array<Array<Number>>;
        var titles = ["Grade M · S", "Timing only"];
        var notes = ["pick arrow, grade it", "time, heart rate, motion"];
        for (var i = 0; i < 2; i++) {
            var c = cells[i];
            dc.setColor(COLOR_CELL, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(c[0], c[1], c[2], c[3], 14);
            if (i == sel) {
                dc.setColor(COLOR_GO, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
                dc.drawRoundedRectangle(c[0], c[1], c[2], c[3], 14);
                dc.setPenWidth(1);
            }
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(c[0] + c[2] / 2, c[1] + (c[3] * 36) / 100, Graphics.FONT_SMALL, titles[i],
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(c[0] + c[2] / 2, c[1] + (c[3] * 74) / 100, Graphics.FONT_XTINY, notes[i],
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}

class SetupDelegate extends KeyedDelegate {
    hidden var _view as SetupView;

    function initialize(view as SetupView) {
        KeyedDelegate.initialize();
        _view = view;
    }

    hidden function choose(v as Number) as Void {
        if (v == 0) { return; }
        if (_view.stage < 0) {
            endState().setGrading(v == GRADING_ON);
            if (v == GRADING_OFF) {
                // timing only: no arrows to count or pick
                buzz();
                showStart();
                return;
            }
            _view.stage = 0;
            _view.sel = _view.indexOf(_view.options(), _view.perEnd);
            WatchUi.requestUpdate();
        } else if (_view.stage == 0) {
            _view.perEnd = v;
            _view.stage = 1;
            // default: as many numbered arrows as before, at least one end's worth
            var owned = endState().owned;
            var opts = _view.options();
            _view.sel = _view.indexOf(opts, owned < v ? v : owned);
            if (opts.size() == 1) {
                done(v);
                return;
            }
            WatchUi.requestUpdate();
        } else {
            done(v);
        }
    }

    hidden function done(owned as Number) as Void {
        var st = endState();
        st.setPerEnd(_view.perEnd);
        st.setOwned(owned);
        buzz();
        showStart();
    }

    function onTouch(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
        choose(cellValueAt(_view.cells, xy[0], xy[1]));
        return true;
    }

    // START picks the highlighted value (the setup is not a running round)
    function onSelect() as Boolean {
        if (_view.sel >= 0 && _view.sel < _view.cells.size()) { choose(_view.cells[_view.sel][4]); }
        return true;
    }

    hidden function move(d as Number) as Void {
        var n = _view.cells.size();
        if (n == 0) { return; }
        _view.sel = (_view.sel + d + n) % n;
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

    // BACK: to the question before; on the first, back to the start screen
    function onBack() as Boolean {
        if (_view.stage == 1) {
            _view.stage = 0;
            _view.sel = _view.indexOf(_view.options(), _view.perEnd);
            WatchUi.requestUpdate();
            return true;
        }
        if (_view.stage == 0) {
            _view.stage = -1;
            _view.sel = 0;
            WatchUi.requestUpdate();
            return true;
        }
        showStart();
        return true;
    }
}

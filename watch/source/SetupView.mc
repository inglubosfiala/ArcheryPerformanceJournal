import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

const PER_END_CHOICES = [3, 4, 5, 6, 8, 12];

// The setup (UP on the start screen): how many arrows per end, then how many numbered arrows are
// shot with (the arrow picker offers 1..that). Then back to the start screen.
class SetupView extends WatchUi.View {
    var stage as Number = 0; // 0: arrows per end, 1: numbered arrows
    var perEnd as Number = 6;
    var cells as Array<Array<Number>> = [] as Array<Array<Number>>;
    var sel as Number = 0;

    function initialize() {
        View.initialize();
        perEnd = endState().perEnd;
        sel = indexOf(options(), perEnd);
    }

    function options() as Array<Number> {
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
            stage == 0 ? "Setup" : perEnd.toString() + " arrows per end", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 17) / 100, Graphics.FONT_SMALL,
            stage == 0 ? "Arrows per end" : "Numbered arrows", Graphics.TEXT_JUSTIFY_CENTER);

        var opts = options();
        if (sel >= opts.size()) { sel = opts.size() - 1; }
        cells = drawGrid(dc, opts, sel, Graphics.COLOR_WHITE);
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
        if (_view.stage == 0) {
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

    // BACK: from the second question to the first; on the first, back to the start screen unchanged
    function onBack() as Boolean {
        if (_view.stage == 1) {
            _view.stage = 0;
            _view.sel = _view.indexOf(_view.options(), _view.perEnd);
            WatchUi.requestUpdate();
            return true;
        }
        showStart();
        return true;
    }
}

import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// ---------------------------------------------------------------- start screen

// The app's first screen, as in Garmin's activity apps: START starts the round, UP opens the setup.
class StartView extends WatchUi.View {
    var cx as Number = 0;
    var cy as Number = 0;
    var r as Number = 0;

    function initialize() {
        View.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var st = endState();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // the START button sits at about 2 o'clock: a green mark on the edge next to it
        dc.setColor(COLOR_GO, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(10);
        dc.drawArc(w / 2, h / 2, w / 2 - 6, Graphics.ARC_COUNTER_CLOCKWISE, 18, 42);
        dc.setPenWidth(1);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 24) / 100, Graphics.FONT_MEDIUM, "Arrow Grades", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 35) / 100, Graphics.FONT_XTINY,
            st.perEnd.toString() + " arrows/end · arrows 1-" + st.owned.toString(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // a big START button for touch, too
        cx = w / 2;
        cy = (h * 60) / 100;
        r = w / 7;
        dc.setColor(COLOR_GO, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, Graphics.FONT_SMALL, "START", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 81) / 100, Graphics.FONT_XTINY, "UP: setup", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(w / 2, (h * 90) / 100, Graphics.FONT_XTINY, "v" + APP_VERSION, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

class StartDelegate extends KeyedDelegate {
    hidden var _view as StartView;

    function initialize(view as StartView) {
        KeyedDelegate.initialize();
        _view = view;
    }

    function onSelect() as Boolean {
        app().startRound();
        return true;
    }

    function onTouch(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
        var dx = xy[0] - _view.cx;
        var dy = xy[1] - _view.cy;
        if (dx * dx + dy * dy <= (_view.r + 10) * (_view.r + 10)) { app().startRound(); }
        return true;
    }

    function onPreviousPage() as Boolean {
        showSetup();
        return true;
    }

    function onMenu() as Boolean {
        showSetup();
        return true;
    }

    // BACK leaves the app
    function onBack() as Boolean {
        return false;
    }
}

// ---------------------------------------------------------------- stop screen

const STOP_RESUME = 0;
const STOP_SAVE = 1;
const STOP_DISCARD = 2;

// START while the round runs: the activity is paused and the round so far is shown, with Resume
// (also BACK), Save and Discard.
class StopView extends WatchUi.View {
    var sel as Number = STOP_RESUME;
    var rows as Array<Array<Number>> = [] as Array<Array<Number>>; // [y, h]
    var discardAsked as Boolean = false; // the Discard confirmation answered yes

    function initialize() {
        View.initialize();
    }

    // the Discard confirmation closed: act on its answer here, once this screen is back on top
    function onShow() as Void {
        if (discardAsked) {
            discardAsked = false;
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            app().discardRound();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var st = endState();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var secs = 0;
        var info = Activity.getActivityInfo();
        if (info != null && info.timerTime != null) { secs = (info.timerTime as Number) / 1000; }
        var avg = st.roundAverages();
        var ends = st.roundEnds + (st.closed ? 0 : 1);
        var arrows = st.roundArrows + (st.closed ? 0 : st.shots.size());

        dc.setColor(COLOR_M, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 11) / 100, Graphics.FONT_XTINY, "Stopped", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 22) / 100, Graphics.FONT_MEDIUM, clock(secs), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 32) / 100, Graphics.FONT_XTINY,
            ends.toString() + (ends == 1 ? " end · " : " ends · ") + arrows.toString() + " arrows", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(w / 2, (h * 40) / 100, Graphics.FONT_XTINY,
            "M " + (avg[0] > 0 ? avg[0].format("%.1f") : "-") + "   S " + (avg[1] > 0 ? avg[1].format("%.1f") : "-"),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        var labels = ["Resume", "Save", "Discard"];
        var colors = [COLOR_GO, Graphics.COLOR_WHITE, 0xE5484D];
        var rowH = (h * 13) / 100;
        var y = (h * 47) / 100;
        var x = (w * 18) / 100;
        rows = [] as Array<Array<Number>>;
        for (var i = 0; i < 3; i++) {
            rows.add([y, rowH]);
            dc.setColor(COLOR_CELL, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y, w - 2 * x, rowH - 6, 12);
            if (i == sel) {
                dc.setColor(colors[i] as Number, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(3);
                dc.drawRoundedRectangle(x, y, w - 2 * x, rowH - 6, 12);
                dc.setPenWidth(1);
            }
            dc.setColor(colors[i] as Number, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y + (rowH - 6) / 2, Graphics.FONT_SMALL, labels[i] as String, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            y += rowH;
        }
    }
}

class StopDelegate extends KeyedDelegate {
    hidden var _view as StopView;

    function initialize(view as StopView) {
        KeyedDelegate.initialize();
        _view = view;
    }

    hidden function act(choice as Number) as Void {
        if (choice == STOP_RESUME) {
            app().resumeRound();
        } else if (choice == STOP_SAVE) {
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            app().saveRound();
        } else if (choice == STOP_DISCARD) {
            WatchUi.pushView(new WatchUi.Confirmation("Discard this round?"), new DiscardConfirm(_view), WatchUi.SLIDE_IMMEDIATE);
        }
    }

    function onTouch(evt as WatchUi.ClickEvent) as Boolean {
        var y = evt.getCoordinates()[1];
        for (var i = 0; i < _view.rows.size(); i++) {
            if (y >= _view.rows[i][0] && y < _view.rows[i][0] + _view.rows[i][1]) {
                act(i);
                return true;
            }
        }
        return true;
    }

    function onSelect() as Boolean {
        act(_view.sel);
        return true;
    }

    function onNextPage() as Boolean {
        _view.sel = (_view.sel + 1) % 3;
        WatchUi.requestUpdate();
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.sel = (_view.sel + 2) % 3;
        WatchUi.requestUpdate();
        return true;
    }

    // BACK: resume, as on Garmin's own stop screens
    function onBack() as Boolean {
        app().resumeRound();
        return true;
    }
}

class DiscardConfirm extends WatchUi.ConfirmationDelegate {
    hidden var _view as StopView;

    function initialize(view as StopView) {
        ConfirmationDelegate.initialize();
        _view = view;
    }

    function onResponse(response as WatchUi.Confirm) as Boolean {
        if (response == WatchUi.CONFIRM_YES) { _view.discardAsked = true; }
        return true;
    }
}

// ---------------------------------------------------------------- saved / discarded

// After Save or Discard: a short note, then the app closes (as Garmin's activity apps do).
class DoneView extends WatchUi.View {
    hidden var _message as String;
    hidden var _timer as Timer.Timer? = null;

    function initialize(message as String) {
        View.initialize();
        _message = message;
    }

    function onShow() as Void {
        var t = new Timer.Timer();
        t.start(method(:onDone), 2000, false);
        _timer = t;
    }

    function onDone() as Void {
        System.exit();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        dc.setColor(_message.equals("Saved") ? COLOR_GO : COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, _message, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

class DoneDelegate extends KeyedDelegate {
    function initialize() {
        KeyedDelegate.initialize();
    }

    function onSelect() as Boolean {
        System.exit();
    }

    function onBack() as Boolean {
        System.exit();
    }
}

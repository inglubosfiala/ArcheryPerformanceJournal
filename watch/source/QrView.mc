import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

// The end's watch code, for the journal's Watch scan. Black on white with a quiet zone,
// inside the round screen's inscribed square.
class QrView extends WatchUi.View {
    hidden var _enc as Qr.Encoder? = null;
    hidden var _timer as Timer.Timer? = null;
    var bottom as Number = 0;
    var top as Number = 0;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        _enc = new Qr.Encoder(endState().payload());
        var t = new Timer.Timer();
        t.start(method(:onTick), 50, true);
        _timer = t;
        if (Attention has :backlight) {
            try { Attention.backlight(true); } catch (e) { }
        }
    }

    function onHide() as Void {
        stopTimer();
    }

    hidden function stopTimer() as Void {
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
    }

    // builds the code one stage per tick, under the watchdog
    function onTick() as Void {
        if (_enc == null || (_enc as Qr.Encoder).step()) {
            stopTimer();
            WatchUi.requestUpdate();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var st = endState();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var enc = _enc;
        if (enc == null || !enc.isDone() || enc.failed) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_SMALL, enc != null && enc.failed ? "Too many arrows" : "...",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        var size = enc.size;
        var mods = enc.modules as ByteArray;
        var side = (w * 70) / 100;
        var px = side / (size + 4);
        var full = px * (size + 4);
        var x0 = (w - full) / 2;
        var y0 = (h - full) / 2;
        bottom = y0 + full;
        top = y0;

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(x0, y0, full, full);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        var ox = x0 + 2 * px;
        var oy = y0 + 2 * px;
        for (var r = 0; r < size; r++) {
            var c = 0;
            while (c < size) {
                if (mods[r * size + c] == 1) {
                    var start = c;
                    while (c < size && mods[r * size + c] == 1) { c++; }
                    dc.fillRectangle(ox + start * px, oy + r * px, (c - start) * px, px);
                } else {
                    c++;
                }
            }
        }

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, y0 - 24, Graphics.FONT_XTINY,
            "End " + st.endNo.toString() + " · " + st.shots.size().toString() + " arrows",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(0x8C8C8C, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, bottom + (h - bottom) / 3, Graphics.FONT_XTINY, "Tap here: next end",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

class QrDelegate extends KeyedDelegate {
    hidden var _view as QrView;

    function initialize(view as QrView) {
        KeyedDelegate.initialize();
        _view = view;
    }

    hidden function next() as Void {
        lapAndNextEnd();
        buzz();
        showShots();
    }

    // Only a tap below the code starts the next end, so a touch while scanning does nothing.
    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
        if (_view.bottom > 0 && xy[1] > _view.bottom) { next(); }
        else if (_view.top > 0 && xy[1] < _view.top) { openMenu(); }
        return true;
    }

    function onSelect() as Boolean {
        next();
        return true;
    }

    // Back: return to the end to fix a grade (Back again there undoes the last shot).
    function onBack() as Boolean {
        showShots();
        return true;
    }

    function onMenu() as Boolean {
        openMenu();
        return true;
    }
}

import Toybox.Lang;
import Toybox.WatchUi;

// Screen taps and buttons. A BehaviorDelegate turns a tap on the epix2 into onSelect (no
// coordinates), so the screens use a plain InputDelegate and map the buttons themselves.
// The menu opens with the system menu key (hold UP) or a tap on the header (see the views).
class KeyedDelegate extends WatchUi.InputDelegate {
    function initialize() {
        InputDelegate.initialize();
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER) { return onSelect(); }
        if (k == WatchUi.KEY_ESC) { return onBack(); }
        if (k == WatchUi.KEY_DOWN) { return onNextPage(); }
        if (k == WatchUi.KEY_UP) { return onPreviousPage(); }
        if (k == WatchUi.KEY_MENU) { return onMenu(); }
        return false;
    }

    function onSelect() as Boolean { return false; }
    function onBack() as Boolean { return false; }
    function onNextPage() as Boolean { return false; }
    function onPreviousPage() as Boolean { return false; }
    function onMenu() as Boolean { return false; }
}

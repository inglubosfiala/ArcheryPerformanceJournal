import Toybox.Lang;
import Toybox.WatchUi;

// Screen taps and buttons. A BehaviorDelegate turns a tap on the epix2 into onSelect (no
// coordinates), so the screens use a plain InputDelegate and map the buttons themselves:
//   START (KEY_ENTER)  start / stop, as in Garmin's activity apps
//   BACK/LAP (KEY_ESC, or KEY_LAP)  back, or lap while a round runs
//   UP / DOWN, hold UP (KEY_MENU)
class KeyedDelegate extends WatchUi.InputDelegate {
    function initialize() {
        InputDelegate.initialize();
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        app().noteInput();
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER) { return onSelect(); }
        if (k == WatchUi.KEY_ESC) { return onBack(); }
        if (k == WatchUi.KEY_LAP) { return onBack(); }
        if (k == WatchUi.KEY_DOWN) { return onNextPage(); }
        if (k == WatchUi.KEY_UP) { return onPreviousPage(); }
        if (k == WatchUi.KEY_MENU) { return onMenu(); }
        return false;
    }

    // a touch on the screen: noted, then handled by the screen (onTouch)
    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        app().noteInput();
        return onTouch(evt);
    }

    function onTouch(evt as WatchUi.ClickEvent) as Boolean { return false; }
    function onSelect() as Boolean { return false; }
    function onBack() as Boolean { return false; }
    function onNextPage() as Boolean { return false; }
    function onPreviousPage() as Boolean { return false; }
    function onMenu() as Boolean { return false; }
}

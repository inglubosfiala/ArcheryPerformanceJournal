import Toybox.Lang;
import Toybox.WatchUi;

// Menu (tap the header, or hold UP): show the code early, undo, next end, new round.
function openMenu() as Void {
    var st = endState();
    var menu = new WatchUi.Menu2({ :title => "Arrow Grades" });
    menu.addItem(new WatchUi.MenuItem("Show code", "End now", :code, {}));
    menu.addItem(new WatchUi.MenuItem("Undo last shot", null, :undo, {}));
    menu.addItem(new WatchUi.MenuItem("Next end", "Clears this end", :next, {}));
    menu.addItem(new WatchUi.MenuItem("New round", st.perEnd.toString() + " per end, arrows 1-" + st.owned.toString(), :round, {}));
    menu.addItem(new WatchUi.MenuItem("Finish round", "Save the activity", :finish, {}));
    WatchUi.pushView(menu, new GradesMenuDelegate(), WatchUi.SLIDE_UP);
}

class GradesMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var st = endState();
        var id = item.getId();
        if (id == :code) {
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            if (st.shots.size() > 0) { showCode(); }
        } else if (id == :undo) {
            st.undoLast();
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            showShots();
        } else if (id == :next) {
            lapAndNextEnd();
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            showShots();
        } else if (id == :round) {
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            showSetup();
        } else if (id == :finish) {
            app().recorder.finish();
            buzz();
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            showSetup();
        }
    }
}

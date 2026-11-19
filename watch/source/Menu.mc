import Toybox.Lang;
import Toybox.WatchUi;

// Menu during an end (tap the header, or hold UP): fix a grade.
function openMenu() as Void {
    var menu = new WatchUi.Menu2({ :title => "Arrow Grades" });
    menu.addItem(new WatchUi.MenuItem("Back one step", "Redo the last tap", :back, {}));
    menu.addItem(new WatchUi.MenuItem("Undo last shot", null, :undo, {}));
    WatchUi.pushView(menu, new GradesMenuDelegate(), WatchUi.SLIDE_UP);
}

class GradesMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var st = endState();
        var id = item.getId();
        if (id == :back) {
            st.back();
        } else if (id == :undo) {
            st.undoLast();
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

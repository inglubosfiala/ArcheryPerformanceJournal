import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.WatchUi;

class ArcheryApp extends Application.AppBase {
    var state as EndState?;
    hidden var _hr as Number = 0;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        self.state = new EndState();
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
        Sensor.enableSensorEvents(method(:onSensor));
    }

    function onStop(state as Dictionary?) as Void {
        Sensor.enableSensorEvents(null);
        if (self.state != null) { (self.state as EndState).save(); }
    }

    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) { _hr = info.heartRate as Number; }
    }

    // Heart rate now, 0 when the watch has none.
    function heartRate() as Number {
        if (_hr > 0) { return _hr; }
        var info = Activity.getActivityInfo();
        if (info != null && info.currentHeartRate != null) { return info.currentHeartRate as Number; }
        return 0;
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        if ((state as EndState).isComplete()) {
            var q = new QrView();
            return [q, new QrDelegate(q)];
        }
        var st = state as EndState;
        // opened on an empty end: start with the round setup (Continue keeps the round)
        if (st.shots.size() == 0 && st.pendingNo == 0) {
            var sv = new SetupView();
            return [sv, new SetupDelegate(sv)];
        }
        var v = new ShotView();
        return [v, new ShotDelegate(v)];
    }
}

function app() as ArcheryApp {
    return Application.getApp() as ArcheryApp;
}

function endState() as EndState {
    return app().state as EndState;
}

function buzz() as Void {
    if (Attention has :vibrate) {
        Attention.vibrate([new Attention.VibeProfile(60, 40)] as Array<Attention.VibeProfile>);
    }
}

function showCode() as Void {
    var q = new QrView();
    WatchUi.switchToView(q, new QrDelegate(q), WatchUi.SLIDE_LEFT);
}

function showShots() as Void {
    var v = new ShotView();
    WatchUi.switchToView(v, new ShotDelegate(v), WatchUi.SLIDE_RIGHT);
}

function showSetup() as Void {
    var v = new SetupView();
    WatchUi.switchToView(v, new SetupDelegate(v), WatchUi.SLIDE_UP);
}

import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.Timer;
import Toybox.WatchUi;

class ArcheryApp extends Application.AppBase {
    var state as EndState?;
    var recorder as Recorder = new Recorder();
    hidden var _hr as Number = 0;
    hidden var _ticker as Timer.Timer? = null;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        self.state = new EndState();
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
        Sensor.enableSensorEvents(method(:onSensor));
        // one heart-rate sample per second for the end's trace
        var t = new Timer.Timer();
        t.start(method(:onSecond), 1000, true);
        _ticker = t;
    }

    function onSecond() as Void {
        recorder.tick();
        if (self.state != null) { (self.state as EndState).sample(heartRate()); }
    }

    function onStop(state as Dictionary?) as Void {
        Sensor.enableSensorEvents(null);
        if (_ticker != null) { (_ticker as Timer.Timer).stop(); }
        // leaving the app ends the activity; it is saved, not lost
        recorder.finish();
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
            recorder.start();
            var q = new QrView();
            return [q, new QrDelegate(q)];
        }
        var st = state as EndState;
        // opened on an empty end: start with the round setup (Continue keeps the round)
        if (st.shots.size() == 0 && st.pendingNo == 0) {
            var sv = new SetupView();
            return [sv, new SetupDelegate(sv)];
        }
        recorder.start();
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
    app().recorder.start(); // no-op while the round is recorded
    var v = new ShotView();
    WatchUi.switchToView(v, new ShotDelegate(v), WatchUi.SLIDE_RIGHT);
}

function showSetup() as Void {
    var v = new SetupView();
    WatchUi.switchToView(v, new SetupDelegate(v), WatchUi.SLIDE_UP);
}

// The end is done: its averages go on the activity lap, then the next end starts.
function lapAndNextEnd() as Void {
    var st = endState();
    var avg = st.averages();
    app().recorder.lap(avg[0], avg[1]);
    st.nextEnd();
}

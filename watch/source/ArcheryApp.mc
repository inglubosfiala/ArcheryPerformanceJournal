import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// The app runs like Garmin's own activity apps:
//   start screen  START starts the round (and its activity), UP opens the setup
//   end           grade each shot by touch; LAP (or the last arrow) closes the end
//   rest          the end's code for the journal and a rest timer; LAP starts the next end
//   START         stop screen at any time: Resume, Save, Discard
// The version shown on the start screen; keep it the same as the version typed in the store upload.
const APP_VERSION = "0.8.0";

const PHASE_IDLE = 0;
const PHASE_END = 1;
const PHASE_REST = 2;

class ArcheryApp extends Application.AppBase {
    var state as EndState?;
    var recorder as Recorder = new Recorder();
    var detector as ShotDetector = new ShotDetector();
    var phase as Number = PHASE_IDLE;
    var paused as Boolean = false;
    var phaseStart as Number = 0; // System.getTimer() when the end or the rest began
    hidden var _hr as Number = 0;
    hidden var _ticker as Timer.Timer? = null;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        self.state = new EndState();
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
        Sensor.enableSensorEvents(method(:onSensor));
        var t = new Timer.Timer();
        t.start(method(:onSecond), 1000, true);
        _ticker = t;
    }

    // Every second: the heart-rate trace of the end, the activity markers, the timers on screen.
    function onSecond() as Void {
        recorder.tick();
        if (phase == PHASE_END && !paused && self.state != null) {
            (self.state as EndState).sample(heartRate());
        }
        if (phase != PHASE_IDLE) { WatchUi.requestUpdate(); }
    }

    function onStop(state as Dictionary?) as Void {
        Sensor.enableSensorEvents(null);
        stopMotion();
        if (_ticker != null) { (_ticker as Timer.Timer).stop(); }
        // the app closed while a round ran (it should be stopped and saved first): save, not lose it
        if (recorder.isRecording()) { saveLapValues(); }
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
        var v = new StartView();
        return [v, new StartDelegate(v)];
    }

    // ---------------------------------------------------------------- the draw hand's motion

    // The accelerometer for the shot detector, 25 samples a second, while a round runs.
    hidden function startMotion() as Void {
        if (!(Sensor has :registerSensorDataListener)) { return; }
        try {
            Sensor.registerSensorDataListener(method(:onMotion), {
                :period => 1,
                :accelerometer => { :enabled => true, :sampleRate => ShotDetector.RATE }
            });
        } catch (e) {
            // no high-rate accelerometer: the round works without shot timing
        }
    }

    hidden function stopMotion() as Void {
        if (Sensor has :unregisterSensorDataListener) {
            try { Sensor.unregisterSensorDataListener(); } catch (e) { }
        }
    }

    function onMotion(data as Sensor.SensorData) as Void {
        if (phase != PHASE_END || paused) { return; }
        var acc = data.accelerometerData;
        if (acc == null) { return; }
        if (detector.feed(acc.x as Array<Number>, acc.y as Array<Number>, acc.z as Array<Number>)) {
            var shot = detector.lastShot as Array<Number>;
            recorder.markRelease(shot[2]);
            WatchUi.requestUpdate();
        }
    }

    // Seconds since the end or the rest began.
    function phaseSeconds() as Number {
        return (System.getTimer() - phaseStart) / 1000;
    }

    // ---------------------------------------------------------------- the round

    function startRound() as Void {
        var st = state as EndState;
        st.newRound(st.perEnd, st.owned);
        recorder.start();
        recorder.setLap(PHASE_END, 0.0, 0.0);
        detector.reset();
        startMotion();
        phase = PHASE_END;
        paused = false;
        phaseStart = System.getTimer();
        buzz();
        showShots();
    }

    // LAP, or the last arrow graded: the end is closed, its code shown, the rest timer runs.
    // The heart rate and the raw motion are logged whether or not the arrows were graded.
    function closeEnd() as Void {
        var st = state as EndState;
        if (phase != PHASE_END) { return; } // grading is optional: an end without grades closes too
        st.detected = detector.shots;
        st.closeEnd();
        var avg = st.averages();
        recorder.setLap(PHASE_END, avg[0], avg[1]);
        recorder.lap();
        recorder.setLap(PHASE_REST, 0.0, 0.0);
        phase = PHASE_REST;
        phaseStart = System.getTimer();
        buzz();
        showRest();
    }

    // LAP while resting: the next end.
    function nextEnd() as Void {
        if (phase != PHASE_REST) { return; }
        recorder.lap();
        recorder.setLap(PHASE_END, 0.0, 0.0);
        (state as EndState).nextEnd();
        detector.reset();
        phase = PHASE_END;
        phaseStart = System.getTimer();
        buzz();
        showShots();
    }

    // START: the stop screen (the activity timer pauses).
    function pauseRound() as Void {
        if (phase == PHASE_IDLE || paused) { return; }
        paused = true;
        recorder.pause();
        buzz();
        var v = new StopView();
        WatchUi.pushView(v, new StopDelegate(v), WatchUi.SLIDE_UP);
    }

    function resumeRound() as Void {
        if (!paused) { return; }
        paused = false;
        recorder.resume();
        buzz();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function saveRound() as Void {
        saveLapValues();
        recorder.finish();
        endRound("Saved");
    }

    function discardRound() as Void {
        recorder.discard();
        endRound("Discarded");
    }

    // the lap in progress gets its values before the activity closes
    hidden function saveLapValues() as Void {
        if (phase == PHASE_END && state != null) {
            var avg = (state as EndState).averages();
            recorder.setLap(PHASE_END, avg[0], avg[1]);
        }
    }

    hidden function endRound(message as String) as Void {
        stopMotion();
        phase = PHASE_IDLE;
        paused = false;
        longBuzz();
        var v = new DoneView(message);
        WatchUi.switchToView(v, new DoneDelegate(), WatchUi.SLIDE_IMMEDIATE);
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

function longBuzz() as Void {
    if (Attention has :vibrate) {
        Attention.vibrate([new Attention.VibeProfile(80, 300)] as Array<Attention.VibeProfile>);
    }
}

function showShots() as Void {
    var v = new ShotView();
    WatchUi.switchToView(v, new ShotDelegate(v), WatchUi.SLIDE_RIGHT);
}

function showRest() as Void {
    var v = new RestView();
    WatchUi.switchToView(v, new RestDelegate(v), WatchUi.SLIDE_LEFT);
}

function showStart() as Void {
    var v = new StartView();
    WatchUi.switchToView(v, new StartDelegate(v), WatchUi.SLIDE_DOWN);
}

function showSetup() as Void {
    var v = new SetupView();
    WatchUi.switchToView(v, new SetupDelegate(v), WatchUi.SLIDE_UP);
}

// "m:ss", or "h:mm:ss" from an hour on.
function clock(secs as Number) as String {
    if (secs < 0) { secs = 0; }
    var h = secs / 3600;
    var m = (secs % 3600) / 60;
    var s = secs % 60;
    return h > 0 ? h.toString() + ":" + m.format("%02d") + ":" + s.format("%02d") : m.toString() + ":" + s.format("%02d");
}

import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.FitContributor;
import Toybox.Lang;
import Toybox.SensorLogging;

// The round as a Garmin activity: heart rate, time and calories as for any workout, each end a lap
// with its average M and S. The raw accelerometer and gyroscope are logged into the same FIT file
// (SensorLogger), with a marker at each arrow tap and grade, so the shots can be found in the
// motion data afterwards (to tune a shot detector: draw, anchor, release).
class Recorder {
    // record fields: set for one second, then back to 0
    static const FIELD_SHOT = 0;   // arrow number at the arrow tap
    static const FIELD_GRADE = 1;  // M * 10 + S at the S tap
    // lap fields
    static const FIELD_END_M = 2;
    static const FIELD_END_S = 3;

    hidden var _session as ActivityRecording.Session? = null;
    hidden var _shot as FitContributor.Field? = null;
    hidden var _grade as FitContributor.Field? = null;
    hidden var _endM as FitContributor.Field? = null;
    hidden var _endS as FitContributor.Field? = null;
    hidden var _markSecs as Number = 0;

    function initialize() {
    }

    function isRecording() as Boolean {
        return _session != null;
    }

    function start() as Void {
        if (_session != null || !(Toybox has :ActivityRecording)) { return; }
        var options = {
            :name => "Archery",
            :sport => Activity.SPORT_GENERIC,
            :subSport => Activity.SUB_SPORT_GENERIC
        };
        if (Toybox has :SensorLogging) {
            try {
                options[:sensorLogger] = new SensorLogging.SensorLogger({
                    :accelerometer => { :enabled => true },
                    :gyroscope => { :enabled => true }
                });
            } catch (e) {
                // no raw motion on this device: record the activity without it
            }
        }
        var s = ActivityRecording.createSession(options);
        _shot = s.createField("shot", FIELD_SHOT, FitContributor.DATA_TYPE_UINT8, { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "arrow" });
        _grade = s.createField("grade", FIELD_GRADE, FitContributor.DATA_TYPE_UINT8, { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "MS" });
        _endM = s.createField("end_m", FIELD_END_M, FitContributor.DATA_TYPE_FLOAT, { :mesgType => FitContributor.MESG_TYPE_LAP, :units => "M" });
        _endS = s.createField("end_s", FIELD_END_S, FitContributor.DATA_TYPE_FLOAT, { :mesgType => FitContributor.MESG_TYPE_LAP, :units => "S" });
        (_shot as FitContributor.Field).setData(0);
        (_grade as FitContributor.Field).setData(0);
        s.start();
        _session = s;
    }

    // Called every second: a marker stays in the record for one second.
    function tick() as Void {
        if (_markSecs > 0) {
            _markSecs--;
            if (_markSecs == 0) {
                if (_shot != null) { (_shot as FitContributor.Field).setData(0); }
                if (_grade != null) { (_grade as FitContributor.Field).setData(0); }
            }
        }
    }

    function markArrow(no as Number) as Void {
        if (_shot == null) { return; }
        (_shot as FitContributor.Field).setData(no);
        _markSecs = 2;
    }

    function markGrade(m as Number, s as Number) as Void {
        if (_grade == null) { return; }
        (_grade as FitContributor.Field).setData(m * 10 + s);
        _markSecs = 2;
    }

    // The end is done: its averages on the lap, then a new lap for the next end.
    function lap(avgM as Float, avgS as Float) as Void {
        if (_session == null) { return; }
        if (_endM != null) { (_endM as FitContributor.Field).setData(avgM); }
        if (_endS != null) { (_endS as FitContributor.Field).setData(avgS); }
        (_session as ActivityRecording.Session).addLap();
    }

    // Save the activity to Garmin Connect (on the next sync).
    function finish() as Void {
        if (_session == null) { return; }
        var s = _session as ActivityRecording.Session;
        if (s.isRecording()) { s.stop(); }
        s.save();
        _session = null;
        _shot = null;
        _grade = null;
        _endM = null;
        _endS = null;
    }
}

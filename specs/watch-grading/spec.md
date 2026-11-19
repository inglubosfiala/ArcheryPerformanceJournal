# Spec: Grade arrows on a Garmin watch, bring them in with a QR code

**Status:** Proposed · **Date:** 2026-11-18 · **Owner:** Vladimír Gál · Private project, tracked locally (no issue tracker)

## Problem Statement

The journal grades every arrow on process: M (mental program) and S (shooting cycle), each 1–5. While shooting there is no time to take out the phone and grade each arrow, and by the time the archer walks to the target the grades of the individual arrows are forgotten. The grades then get guessed or skipped, which defeats the point of grading process rather than score.

## Solution

A small **Connect IQ watch app** for the archer's Garmin Epix. After each shot the archer makes three quick taps on the watch: **which arrow** (its number), **M** and **S**. The watch also notes the **heart rate** at the moment of the first tap. When the end is shot, the watch shows a **QR code** of that end. At the target the archer opens the end on the phone, taps **Watch**, and points the phone camera at the watch. The journal fills in the end's slots in arrow-number order with M, S, heart rate and the arrow number. Then the archer scores each slot as usual, and each slot shows which numbered arrow to look for.

There is no server, no Garmin Connect account link and no phone companion app. The watch and the journal only meet through the camera. This keeps the journal static, offline and backend-free (ARCHITECTURE.md).

## User Stories

1. As an archer, I want to grade a shot on my wrist with three taps right after release, so that the grade reflects the shot while I still feel it.
2. As an archer, I want to pick which numbered arrow I just shot, so that the grades stay with that arrow whatever order I shoot in.
3. As an archer, I want the arrow picker to offer only the numbers I haven't graded in this end, and to pick the last one by itself, so that it stays quick.
4. As an archer, I want the watch to note my heart rate at each shot, so that I can see later whether a raised pulse goes with weaker mental grades.
5. As an archer, I want to fix a grade I tapped wrong (undo the last shot, or pick a graded arrow and grade it again), so that a slip of the finger isn't permanent.
6. As an archer, I want the watch to show a QR code when the end is complete (or when I finish an end early), so that I can carry the grades to the phone at the target.
7. As an archer, I want the watch to start the next end after I've shown the code, while keeping the last end available until the next one is started, so that a failed scan can be retried.
8. As an archer, I want to set on the watch how many arrows I shoot per end and how many numbered arrows I have, so that the picker matches my quiver.
9. As an archer, I want a **Watch** button on the end screen in the journal that opens the camera and reads the watch's code, so that the grades land in the end I'm logging.
10. As an archer, I want the imported grades to fill the slots in arrow-number order (lowest number in slot 1) and each slot to show its arrow number, so that I know which hole to score in each slot.
11. As an archer, I want a warning before a scan overwrites grades already in the end, so that I don't lose grades I entered by hand.
12. As an archer, I want a clear message when the code isn't from the watch app, holds more arrows than the end has slots, or can't be read, so that I know what to do.
13. As an archer, I want heart rate per arrow to show in the session detail (next to the grades), so that I can look back at it.
14. As an archer, I want to keep grading by hand on the phone exactly as today when I don't wear the watch, so that the watch is optional.

## Implementation Decisions

### Shared: the watch code (payload)

- Text in the QR code, upper-case alphanumeric so the QR stays in alphanumeric mode (small, easy to scan): `APJ1.E<end>.<arrow>...`
- `APJ1` = app and format version. `E<end>` = the watch's end counter (informational only; the phone always applies the code to the end on screen).
- Each arrow is 7 digits, fixed width: arrow number (2) · M (1) · S (1) · heart rate (3). `0` means "not graded" for M/S and `000` means "no heart rate". Arrows are written in arrow-number order. Example: `APJ1.E3.0143092.0254088.0533101`.
- Up to 12 arrows per code (a QR of version 3–4, very easy to scan from an AMOLED screen).
- One pure parser in the journal (`parseWatchCode(text)` → `{ end, arrows: [{ no, m, s, hr }] }` or an error kind) is the only place that knows the format. The watch has the matching encoder.

### Journal (PWA) side

- **Data:** two optional fields on an arrow: `no` (arrow number, 1–24) and `hr` (beats per minute, 30–250). The validator in `collections.js` accepts them when present. They are optional additions, so there's no migration. Older app versions keep unknown arrow fields because sessions are stored whole. **Confirm during implementation** that backup import and Drive merge don't strip them; if anything does, bump the schema as in v4/v5.
- **Apply:** a pure function in `sessionLogic.js`, `applyWatchGrades(session, code)`. It fills slots 1..k of the shown end with the code's arrows in arrow-number order, setting `m`, `s`, `hr` and `no` and leaving `v`, `x`, `y` alone. It's an error (not a partial import) when the code has more arrows than the end has slots. The view asks before overwriting slots that already have M/S.
- **Scan:** a **Watch** button on the end screen of a graded session. It opens a full-screen camera sheet (same `getUserMedia` pattern as `liveScan.js`) and reads frames with the browser's `BarcodeDetector` (`qr_code`), which is available in Chrome on Android. Where it's missing (desktop Chrome on Windows, for development) the sheet falls back to a vendored QR decoder (jsQR, Apache-2.0) in `public/js/vendor/`, loaded only when needed. There's no build step, and the CSP stays `script-src 'self'`.
- **Show:** the slot shows a small `#n` arrow number when it has one. Session detail shows HR per arrow where present, plus average HR per end. The existing "avg arrow by mental grade" works unchanged once the scores are in.
- **Glossary:** add **Watch code** and **Arrow number** to CONTEXT.md.

### Watch (Connect IQ) side

- A **watch app** (not a data field or widget) in Monkey C, in a new top-level `watch/` folder of this repo. Pages deploys only `public/`, so it doesn't affect the PWA. Target: the owner's Epix model (exact device id to confirm: Epix Gen 2 or Epix Pro 42/47/51 mm). Install by sideloading the `.prg` over USB; not published to the Connect IQ store.
- **Shot flow:** *Arrow* (grid of the unused arrow numbers; the last one is chosen automatically) → *M 1–5* → *S 1–5* → back to *Arrow* for the next shot. Large tap zones laid out for a round screen. Buttons do the same (up/down choose, start confirms, back undoes), for outdoors or a tab-wearing hand.
- **Heart rate:** the optical HR sensor is turned on while the app runs (`Sensor.setEnabledSensors`). The value at the *Arrow* tap is stored; it's the tap closest to release.
- **End:** after the set number of arrows per end, or a long-press *End now*, the watch shows the end summary and the QR code. The code is drawn black-on-white inside the round screen's inscribed square, with a quiet zone and the screen kept bright while shown. *Next end* clears it.
- **QR encoder** written in Monkey C (no library is available): alphanumeric mode, versions 1–4, error correction level M, Reed–Solomon over GF(256), all eight masks scored with the standard penalty rules.
- **Settings** on the watch: arrows per end (default 6), number of arrows owned (default 6, max 24).
- Grades for the current end are kept in app storage, so leaving the app between shots doesn't lose them.

## Testing Decisions

- **Journal, one seam per pure module:** Vitest tests for `parseWatchCode` (valid code, version mismatch, bad length, out-of-range grade/HR, too many arrows) and for `applyWatchGrades` (ordering by arrow number, keeps existing scores, overwrite of graded slots, more arrows than slots, partly graded arrows with `0`). Validator tests cover `no`/`hr`. They follow the style of the existing session-logic tests.
- **Cross-check of the encoder:** a fixed set of payloads is encoded by the watch's encoder in the Connect IQ simulator and saved as module matrices. A Node test decodes them with jsQR, so the watch's output is proven readable by the same decoder the PWA falls back to.
- **Watch:** Monkey C `(:test)` unit tests for the payload encoder and the Reed–Solomon step; the flow is tried in the Connect IQ simulator.
- **Manual, at the range:** grading speed with and without the tab; scanning the code from the Epix screen in daylight and indoors; a full session with numbered arrows shot out of order.

## Out of Scope

- Any automatic sync (Garmin Connect, FIT files, Bluetooth companion app, web requests from the watch). These need either a server or a native app.
- Scoring on the watch (scores stay on the phone, where the target face is).
- Let-downs on the watch (could be added later as a fourth button).
- Publishing the watch app to the Connect IQ store, and supporting watches other than the owner's.
- A whole-session code; the code is always one end.

## Further Notes

- **Toolchain to install (one time):** the Connect IQ SDK Manager with the Epix device files, a developer key, and the VS Code *Monkey C* extension. Java is already installed. None of this is on the machine yet.
- **Wrist:** the bow arm is within reach of the string. Wear the watch on the draw-hand wrist, or try the button mode.
- **Order at the target:** scan first, then score. The slots then show which numbered arrow each one is.
- **Open points:** the exact Epix model; whether a scan should also step the end screen to the next empty slot; whether the watch should vibrate when the end's code is ready.

## Decisions made during implementation (watch)

- **Install via the Connect IQ store as a private beta app**, not over USB (the owner has no cable). `watch/build.ps1 -Store` builds `bin/ArrowGrades.iq`; it is uploaded on the developer dashboard with *Beta app* ticked, which only the owner's account can see, and installed over Bluetooth from the Connect IQ phone app.
- **Fixed mask 0** instead of scoring all eight masks: a decoder reads any mask, and scoring eight masks risks the watch's execution watchdog. The encoder (`watch/source/Qr.mc`) was checked by a line-for-line JS port decoded with jsQR for 0–13 arrows (QR versions 1–5).
- **Fixing a grade** is Back (one step back; at the arrow step it removes the last shot) or *Undo last shot* in the menu (hold UP). Graded arrow numbers are not offered again in the picker.
- **Round setup (v0.2.0):** when the app opens on an empty end it asks *Arrows per end* (3, 4, 5, 6, 8, 12) and then *Numbered arrows* (from that number to 12), then starts End 1; *Continue end N* at the bottom (or Back) keeps the running round. The menu's *New round* opens the same screens.
- **Menu** (tap the "End · shot" header, or the system menu key = hold UP): Show code (end early), Undo last shot, Next end, New round. Settings live in app storage on the watch. The header tap exists because press-and-hold timing proved unreliable to test in the simulator.
- **Plain InputDelegate, not BehaviorDelegate:** on the epix2 a BehaviorDelegate turns a screen tap into `onSelect` without coordinates, so the screens map taps and keys themselves (`watch/source/Keys.mc`).
- **The QR code is built in stages on a 50 ms timer** (`Qr.Encoder.step()`): built in one call it tripped the epix2 watchdog (240 000 instructions). It appears about half a second after the end is complete. The code from the simulator screen was decoded with jsQR and matched the payload exactly.
- On the code screen only a tap **below** the code, or START, starts the next end, so touching the screen while scanning does nothing.

## Decisions made during implementation (journal)

- **Watch** button next to *Let-downs* and *Note* under the target (graded sessions only). It opens a camera sheet (`views/watchScan.js`) that reads the code and fills the **shown** end, so it also works on a saved end opened with Previous.
- **QR reading:** the browser's `BarcodeDetector` where it reads `qr_code` (Chrome on Android); otherwise the vendored jsQR 1.4.0 (`public/js/vendor/jsQR.js`, Apache-2.0, license file beside it) is loaded on first use as a classic script, so the CSP stays `script-src 'self'`. Both files are in the service worker's app shell, so scanning works offline.
- **Overwrite:** when any of the slots to be filled already has a score or a grade, a confirm dialog says which arrow numbers go where; scores always stay.
- **Arrow number on the slot:** `#n` replaces the slot number only while the slot is empty (that is when the archer needs to know which hole to score); once scored the slot shows the score and grades as before.
- **History:** each arrow's heart rate shows as `♥92` under its grades in the ends list. A per-end average heart rate was not added.
- Checked in the browser by feeding the camera the QR code from the watch simulator: the end filled with #1 M3 S4 … #6 M2 S3 and kept the grades when scored.

## Heart rate while shooting (watch 0.3.0, journal)

- **What is recorded:** one heart-rate sample per second while the app runs, kept only for the shooting part of an end: from 30 s before the first arrow's tap to the last arrow's grade. Walking to the target and back is not in it (sampling stops when the end is complete and restarts with the next end).
- **Watch code format 2** (`APJ2`): each arrow carries its shot time `t` (the second of the trace at the arrow tap) instead of a heart rate, and a trailing `.H<step><first><changes>` holds the trace in bins of 1–9 s (at most ~60 points), the first value in 3 digits and one character per further bin for its change (−21..+21, the QR alphanumeric set without space and `.`). The journal still reads format 1 codes.
- **QR encoder:** level L (more capacity; the code is read off a crisp screen), versions 1–10 (up to ~395 characters): unequal block groups, several alignment patterns and version information from version 7. A 6-arrow end with a 3-minute trace is ~110 characters (version 5). Checked by a JS port decoded with jsQR for every version 1–10.
- **Journal:** the end keeps `hrTrace: { step, hr: [...] }`, each arrow `t` and `hr` (read from the trace at its shot). History shows the curve under each end with a tick at every shot (red for M 1–2) and the range and duration (`♥ 85–125 · 2:57`).

## Garmin activity and raw motion (watch 0.4.0)

- **Activity:** a round is recorded as a Garmin activity named *Archery* (sport generic), so Garmin Connect gets the heart rate, time and calories of the whole round. It starts when shooting starts (after the round setup, or on Continue) and is saved by *Finish round* in the menu, by starting a *New round*, or when the app is left (saved, not lost; continuing afterwards starts a new activity).
- **Laps:** each end is a lap; the lap carries the end's average M and S (`end_m`, `end_s` developer fields).
- **Raw motion for the shot detector:** the SensorLogger writes the accelerometer and gyroscope into the FIT file. Developer record fields mark the shots: `shot` = arrow number at the arrow tap, `grade` = M*10+S at the S tap (each for ~2 s). With the watch on the draw hand, this is the data to tune a detector of draw, anchor (hold) and release.
- **Reading it:** `watch/tools/fit_read.py <file.fit> [--csv base]` lists the messages, markers and laps and writes the raw accelerometer / gyroscope and the records as CSV. Get the file from Garmin Connect on the web: the activity → gear icon → *Export Original* (a .zip with the .fit).
- **Checked:** in the simulator the session starts, laps and saves, and the FIT file holds the four developer fields; the simulator has no sensor data, so markers, lap values and raw motion are first seen on the watch.

## Garmin-style controls (watch 0.5.0)

The app now works like Garmin's own activity apps:

- **Start screen:** the app name, the setup (arrows per end, numbered arrows) and a green mark next to the START button. **START** (or the on-screen START button) starts the round and its activity with a vibration; **UP** (or hold UP) opens the setup, which returns to the start screen; **BACK** leaves the app.
- **End:** grading by touch as before; the header shows `End n · shot/per end · end time`. **LAP** (the BACK/LAP button) closes the end, also with nothing graded: grading is optional, the heart rate and the raw motion are logged anyway. An arrow picked but not fully graded is kept with its time and without the missing grades. The last arrow's grade closes the end by itself. The menu (tap the header, or hold UP) has *Back one step* and *Undo last shot*.
- **Rest:** the end's code for the journal and a rest timer (`End n · rest m:ss`); **LAP** (or a tap below the code) starts the next end.
- **Stop:** **START** at any time pauses the activity and shows the time, ends, arrows and the round's average M and S, with **Resume** (default; BACK resumes too), **Save** and **Discard** (asks first). After Save or Discard the app shows *Saved* / *Discarded* and closes.
- **Laps in Garmin Connect:** each end and each rest is a lap (`phase` 1 end, 2 rest); end laps carry the end's average M and S.
- **Heart-rate trace:** now the whole end, from its start (START or LAP) to its close; the 30 s pre-roll before the first tap is gone, since an end may have no taps at all. A code with no arrows but a trace fills only the end's heart rate in the journal.
- **Buttons no longer grade:** START is start/stop, so grading is touch only.
- **Checked** in the simulator with a self-driving round (start, grade, LAP, rest code decoded as `APJ2.E1.0100006.0245002`, next end, stop, resume, stop, save) and its FIT file: laps End 1 (phase 1, M 4.0, S 5.0), Rest (phase 2), End 2 (phase 1).

## End timeline (journal)

- **After the Watch scan** a dialog shows what the watch recorded through the end (`views/watchEnd.js`): a timeline chart with the heart-rate curve, each shot as a numbered marker coloured by its M grade (4-5 green, 3 amber, 1-2 red, none grey) and the seconds between shots; the figures (length, shots, rhythm = average gap, heart-rate range); and the arrows in the order shot (time, gap, M, S, heart rate, score). **OK** goes on to the scoring screen.
- **In History** each end the watch recorded has its heart-rate curve (or *Watch timeline* without a heart rate) under its row; a tap opens the same dialog, with the scores filled in.
- The model is `endTimeline(end)` in `hrTrace.js` (shots sorted by time, gaps, length, heart-rate min/avg/max), unit-tested.

## Shot cycle from the draw hand's motion (watch 0.6.0, journal)

- **Detector on the watch** (`watch/source/ShotDetector.mc`, 25 Hz accelerometer during an end): a shot is a sharp snap (|magnitude - 1 g| > 0.9 g) right after at least 1 s of stillness (jitter < 30 mg). Per shot: **hold** = the stillness before the release (anchor, aiming, expansion), **draw** = the moving back to a 0.5 s pause before it, **set-up** = from the last 1 s rest over the moving (hand rising) and that pause, **steadiness** 0-9 from the jitter while holding. The thresholds are first guesses, to be tuned on real data.
- **Tuning:** the raw accelerometer and gyroscope stay logged in the activity, and each detected release is marked (`release` record field = its hold in 0.1 s) next to the arrow taps. `watch/tools/detect_shots.py` is the same algorithm in Python: `--synthetic` runs it on made-up shots (all six found, set-up/draw/hold within 1 s), and with a FIT file it lists the shots found next to the taps. The Monkey C and Python detectors gave identical results on the synthetic data.
- **Watch code format 3** (`APJ3`): format 2 plus `.D<t 3><set-up 2><draw 2><hold 3><steadiness 1>` per detected shot (0.1 s units), before the trace. The shot screen's bottom line shows the last timed shot (`2.0+4.3s` = draw + hold).
- **Journal:** the end keeps `watchShots: [{ t, setup, draw, hold, steady }]`. The timeline joins each release with the arrow graded on the watch after it (tapped from 2 s before it until the next release, at most 30 s later); unmatched releases and arrows both stay. The dialog shows the phases as a band before each release on the timeline, a **shot cycle** chart with one stacked bar per shot (set-up, draw, hold, total), average draw and hold, and Set-up / Draw / Hold columns in the table.

## Version on the watch (0.7.0)

- The start screen shows the app version (`APP_VERSION` in `ArcheryApp.mc`, e.g. `v0.7.0`). Keep it equal to the version typed in the store upload; the store page shows a new version only some time after the upload, so the watch screen is the reliable check.
- **First real file (activity 25128161340, a 2-minute test on 0.6.0):** the SensorLogger records calibrated milli-g at ~100 Hz in `accelerometer_data` fields 5/6/7 (the tools now read those and resample to 25 Hz). A still hand shows a jitter of 3-10 mg (threshold 30). No release was detected: the one strong snap (1.2 g) was not preceded by stillness, as expected for a test away from the shooting line.

## Detector at 100 Hz (watch 0.8.0)

- **Why:** on the second test file (activity 25128394973, 0.7.0) the watch marked no release, although offline the same detector found a 950 mg snap after a still stretch. The watch's own 25 Hz stream is smoothed and flattens such short peaks; the activity file has the raw 100 Hz motion.
- **Now:** the detector reads the accelerometer at 100 Hz, the same data the activity logs, so tuning offline matches the watch. Times stay the same in seconds (sample constants x4). The jitter is not scaled up (sensor noise is per sample): measured on the real file, a still hand is 2-14 mg and moving up to ~170 mg, so `QUIET` is 15 mg and the smoothing `ALPHA` 1/16 per sample (~0.16 s, as before).
- **Checked:** synthetic shots all found (draw and hold within 0.1-0.3 s, set-up within 0.1 s); watch and Python give identical shots on the same 100 Hz data; 800 samples per tick ran without hitting the watchdog. On the test files the detector now finds snaps after still stretches; one coincides with an arrow tap on the watch, so a tap while the draw hand is still may look like a release (to check on real shots).

## Tuned on real shots (watch 0.9.0, journal)

- **Data:** activity 25128610129, 2 ends x 6 arrows. Each release is the one snap after a long still hold (3.5-5 s); the release snaps were 620-1850 mg (the old 900 mg threshold found 3 of 12). Other jolts (lowering the bow, tapping the watch, LAP) follow shorter stillness and can be as strong.
- **Detector:** `RELEASE` 550 mg, `MIN_HOLD` 1.5 s, and a tremor of up to 0.1 s inside a hold no longer ends it (`BRIDGE`). Scored against the 12 known releases: 11 found and no false ones; the 12th candidate is a snap at the moment of grading the last arrow, most likely the tap itself.
- **Own taps ignored:** the app notes every tap and button press; a snap from 0.5 s before to 1.5 s after one is dropped. A release stays pending 1.5 s before it is kept (and marked in the activity).
- **Arrow matching on the watch:** the archer picks the arrow before shooting and grades after, so a release now belongs to the arrow selected at the release; with none selected, the next arrow picked within 30 s takes it. Watch code **format 4** (`APJ4`) carries it: `.D<t 3><arrow 2><set-up 2><draw 2><hold 3><steadiness 1>` (arrow 00 = none). The journal joins each release with that arrow (format 3 and older still use the time matching).
- **Phases found in that session** (set-up / draw / hold, s): end 1 #1 3.0/0.9/3.7, #2 3.1/3.0/4.3, #3 4.4/2.5/3.8, #4 1.5/2.9/4.2, #5 3.5/2.5/4.2; end 2 #1 2.5/2.0/3.6, #2 5.8/3.6/2.9, #3 3.8/4.1/4.5, #4 2.6/2.1/3.9, #5 4.6/2.7/5.1, #6 4.2/3.7/7.7.
- **Checked:** watch and Python detectors give identical snaps on the first 80 s of the real session at 100 Hz; synthetic shots still all found; 612 journal tests pass.

## Soft releases (watch 0.9.1)

- **Data:** activity 25128765325 (0.9.0), 2 ends x 6 arrows. The watch kept 11 of 12 releases, each on the right arrow; it missed end 1 arrow 4, a soft release of 451 mg after a 2.2 s hold, and end 1 arrow 6 was found only just (~550 mg).
- **Detector:** `RELEASE` lowered from 550 to 420 mg. On both real sessions it finds every release (12 of 12 here, the same 11 as before on 25128610129) and nothing else; false snaps start at 400 mg.
- **Known gap:** a shaky hold (jitter just under `QUIET`) can be cut by a tremor, so the hold reads short and the draw too short (end 2 arrow 4: 1.7 s hold / 0.4 s draw, really about 3 s of hold). Left until more shots are recorded.

## Anchor and follow-through (watch 0.10.0, journal)

- **Why:** checked on the 24 real releases of activities 25128610129 and 25128765325 (throwaway analysis in `watch/tools/prototype_shot3d/`). The expansion itself (about 2 mm over 2-4 s, some 0.1-0.2 mg) is far below the hand's tremor (2-14 mg) and cannot be measured as a distance. Two things can:
  - **The hold is not all anchor.** In most arrows the wrist's tilt still changes by 10-15 degrees over the first seconds of the detected hold (a slow movement, smooth enough to count as still), then stays within a few tenths of a degree until the release.
  - **The follow-through.** Over the 0.1 s after the snap the hand moves about 3 cm along the forearm and 1.5 cm across it, alike from arrow to arrow (spread under 1 cm); a tap on the watch moves it along z (into the screen) instead. Without the gyroscope the path differs by 1-6 mm from the one with it, so the watch uses the accelerometer alone.
- **Settle and anchor:** the detector follows the direction of gravity in 0.1 s means. Back from 0.15 s before the snap, the **anchor** is the stretch whose tilt stays within 2 degrees of its last 0.5 s; the part of the hold before it is **settle**. The tilt's change at anchor (first 0.5 s against last 0.5 s) is kept in 0.1 degrees.
- **Follow-through:** the hand's path in mm along the watch's x, y and z from 0.08 s before the snap is seen to 0.1 s after it: acceleration = gravity - reading (Garmin reads -1000 on z face up), gravity being the mean reading from 0.4 to 0.1 s before the snap. A release is therefore reported 0.1 s after its snap.
- **Watch code format 5** (`APJ5`): a release may end with five more characters, one each from the trace's 43-character alphabet (0-42): settle (0.2 s), tilt change at anchor (0.1 degrees), follow-through x, y, z (3 mm, 21 = 0). When the code would pass 390 characters (many arrows) the watch leaves these out and the release reads as in format 4.
- **Journal:** the end's timeline and History's shot bars split the hold into **Settle** and **Anchor**; the table shows both and **Follow mm**: the path's length and, in brackets, how far it ends from the end's average one. Tiles add the average anchor and follow-through. Ends scanned from older watch versions look as before.
- **Not done:** rejecting snaps without a follow-through in the watch's plane (it would have dropped every tap in the two sessions, but a weak release could go with them).
- **Back:** the archer wears the watch on the left (draw) wrist with the START button towards the hand, so the watch's -x points to the elbow. The journal shows that part of the follow-through as **Back mm** (about 3 cm on the real arrows); worn another way, the sign would be wrong.
- **Checked:** the Python detector gives the tuned figures on both real sessions and still finds every synthetic shot; 618 journal tests pass; the watch app builds. The watch's own arithmetic was not run against real data in the simulator.

## The phases renamed, a pause at set-up, tremors bridged (watch 0.11.0, journal)

- **Test:** activity 25131021078, three arrows shot with a deliberate pause of about 3 s at the set-up position. The pause fell inside the still stretch the detector called the hold, after the movement it called the draw. So the shakiness of the wrist shows the **set** (hooking and gripping) and the **raise** to the set-up position; the slow, smooth draw does not shake the wrist and is part of the still stretch, together with the anchor.
- **Phases now:** **Set** (the old "set-up") · **Set-up** (the old "draw": the raise, plus any pause at the set-up position) · **Draw** (the still stretch while the wrist's tilt moves; the old "settle") · **Anchor** (the tilt steady until the release). On the test: set-up 6.7-7.4 s of which 3.9-4.5 s pause, draw 2.2-3.0 s, anchor 0.7-1.2 s; on the two normal sessions no pause, draw mostly 2.2-3.5 s, anchor 0.7-2.7 s.
- **Pause:** back from the anchor the draw lasts while the tilt moves; it starts after the last 0.5 s in which the tilt changed by less than 1 degree per 0.5 s (or at the start of the still stretch). Watch code **format 6** (`APJ6`) adds it as a sixth character (0.2 s). The saved names stay (`setup`, `draw`, `hold`, `settle`, `pause`); the journal derives set-up = draw + pause, draw = settle - pause, anchor = hold - settle. Ends from watches before 0.10 show Set · Set-up · Draw + anchor.
- **Missed release:** arrow 1 of the test was not found: a tremor of some 0.3 s one second before its release cut the still stretch to 1.1 s, under the 1.5 s needed. `BRIDGE` is now 0.3 s (was 0.1 s): all 3 found there, the same releases as before on the other two sessions.
- **Watch screen:** the reminder line shows draw + anchor of the last release.
- **Checked:** Python detector on the three real sessions and the synthetic shots; 623 journal tests pass; the watch app builds. The watch's own arithmetic was not run against real data in the simulator.

## Grading on or off (watch 0.11.0)

- **Why:** the archer does not always want to grade; the timing, heart rate and motion are worth recording by themselves.
- **Setup:** the setup (UP on the start screen) first asks **Grade the shots?** - "Grade M · S" or "Timing only". With grading it goes on to arrows per end and numbered arrows as before; with timing only it returns to the start screen, which then says "Timing only · no grading". The choice is kept between rounds.
- **Timing only:** the shot screen has nothing to tap: it shows the end and its time, the number of releases found, the heart rate and the last release's draw and anchor. LAP closes the end (it never closes by itself), START pauses, as before. The releases are numbered in the order shot (1-24) and the code carries them with the heart-rate curve and no arrows; the journal shows them under those numbers, ungraded.
- **Checked:** the watch app builds; a journal test reads a timing-only code. The new watch screens were not looked at in the simulator.
- **Start screen (0.11.1):** no title and no "UP: setup" text; a white mark on the edge at the UP button with the menu's three lines beside it shows that UP opens the setup (a tap on the lines does the same). The round's setup line, the START button and the version stay.


## Shot timing per end in History (journal)

- Under each end the watch recorded, History shows its heart-rate curve and, below it, **one bar per shot** (set-up, draw, hold, with the total) on a **linear seconds axis** with gridlines. The axis is the same for every end of the session (its longest shot cycle), so shots compare across ends; a legend sits under the Ends heading. A tap still opens the end's full timeline.
- The timeline dialog's shot-cycle chart has the same seconds axis (per end).

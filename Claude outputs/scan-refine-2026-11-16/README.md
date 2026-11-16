# Full-resolution refinement prototype (2026-11-16)

This prototypes step 1 of the hybrid plan. After the app's photo path finds the arrows on its 640 px close-up (~1 mm per px),
each arrow is measured again on the full-size photo (~3–4× the pixels). The test set is the 16 photos in `tests/RealPhotos`:
the 40 cm triple, 48 arrows, with the ground truth from the file names.

The detector is the **committed** one (`ed27068`, `git archive HEAD public/js`). The working tree was being changed by another session
during the run, so the committed code was used to keep the baseline still. The prototype does not change `public/`.
It only runs on top of `detectArrows`.

```
node refine.mjs <repo-or-snapshot> <rawDir> results.json        # TUNE='{"gap":2,"widen":2.2}' to change the knobs
python -I crops.py results.json ../../tests/RealPhotos crops A+cut
```

## What is measured again

- **A, the tip.** The detector gives the tip and the shaft's direction.
  On the full-size photo, profiles across the shaft (0.5 px steps) give its centre line (a least-squares fit), its width and its darkness.
  Walking from the solid shaft towards the paper, the shaft ends where it is no longer dark. Gaps of up to `gap` mm (shine) are bridged.
  It also ends where the dark area gets wider than `widen` × the shaft (an old hole or a shadow, not the shaft).
- **cut, the WA line-cutter rule.** The edge of the shaft nearest the centre decides the score: the radius minus half the measured shaft width.
  At 640 px the width was too noisy for this (the earlier report's sweep found no gain). At full size it works.
- **B, the local ring line.** Near a ring line, the printed line is looked for on radial profiles beside the shaft, and the point is scored against that line instead of the fitted ellipse.

## Result

| Variant | Right |
|---|---|
| base (the committed detector) | 38 / 48 |
| A | 39 / 48 |
| **A + cut** | **42 / 48** |
| B | 34 / 48 |
| A + B | 40 / 48 |
| A + B + cut | 42 / 48 |

The tip was refined on 42 of 48 arrows. The other 6 had no shaft profile clean enough, so they kept the detector's point.

Robustness (the two knobs of A): A + cut gives 42/48 at all 7 settings tried with `gap` 1–2 mm and `widen` 1.8–3.2.
At the extreme `gap` 4 / `widen` 3.2 it gives 41/48. So the gain does not hang on one lucky setting.

## The 6 arrows still wrong with A + cut (`crops/`)

| Arrow | Real | Read | Why |
|---|---|---|---|
| AD middle | 7 | 10 | Detection: the light-shafted arrow was not found, and an old hole in the gold was taken instead. |
| AA middle | 9 | 8 | Detection: the same light shaft, on the 9/8 line. The detector followed its shadow across the red. |
| AJ bottom | 8 | X | Detection: two sheets in the photo, the wrong sheet's spot. |
| AF bottom | 9 | 8 | Ring fit: the tip is right, on the gold edge, but the fitted 8/9 ring sits 2–3 mm away from the printed edge there. |
| AP bottom | 9 | 10 | Ring fit: the fitted 10/9 ring is ~3 mm outside the printed black line, so the cut pushes the arrow into the 10. |
| AB top | 8 | 9 | Right on the gold/red edge. The shaft touches it in the photo, but the archer scored 8. It may be a judgement call. |

## What it means

- **A + cut is a real, cheap gain: +4 arrows (38 → 42, 79 % → 88 %),** with no training and no network. It costs one extra full-size read per arrow
  (about 30 × 12 mm of the photo, a few thousand samples). In the app it would go after `readPhoto` and run on the photo's own pixels, not the 640 px picture.
  For the live scan, the camera frame is lower resolution, so the gain there is smaller. A still photo taken at lock would bring it back.
- **The next error is the ring fit, not the tip.** Two of the remaining misses have the tip right and the fitted ring a few mm off locally.
  B tries to fix that, but its line finder (colour step + dark dip) is too crude: it breaks 4 arrows that were right.
  A better B fits each printed ring line on its own (the thin black lines and the colour edges, as a ring, not a single radial profile).
  That is still classical work.
- **Three misses are detection:** the light shaft (AA, AD) and the two-sheet photo (AJ). This is where a network
  (shaft segmentation, step 2) or a layout check (AJ) would help. A network is not needed for precision.
- **Caution:** 48 arrows is a small set, and the two knobs were chosen on it. Check the gain on new photos before trusting the exact number.

## Update: re-run on HEAD 255d824 (the shaft-tip fix of the other session)

`255d824` ("place a shaft's arrow at the centre of its hole") does the same thing in the detector at 640 px: it finds the shaft's real end, then moves the point
half the shaft's width back to the centre of the hole. `A+ctr` / `A+ctr+cut` are that rule on the full-size tip.

| Variant | ed27068 | 255d824 |
|---|---|---|
| base | 38 | **40** |
| A | 39 | 38 |
| A + cut | **42** | 39 |
| A + ctr (centre of the hole) | 41 | **41** |
| A + ctr + cut | 41 | 39 |

So most of the +4 is already in the app through `255d824`. Full resolution on top adds **+1 arrow** (40 → 41), which is within the noise of 48 arrows.
It was **not** added to the app. Measuring the tip again at full size is worth it only with more photos to prove it, or together with a better local ring fit.
The 2 tip-right/ring-off misses (AF bottom, AP bottom) are still the clearest next precision gain.

## Local ring fit (L), on HEAD d79ce1c

`localRing` in `refine.mjs`. For an arrow within 6 mm of a ring line, it reads strips across the line at arc positions 3–20 mm on both sides of the arrow, staying off the shaft and its hole.
In each strip it finds the line to 0.1 mm: the deepest thin dark dip for a black line (10/9, 8/7), or the 50 % crossing between the two ring colours for a colour step (9/8, 7/6, the spot's edge).
A robust straight fit r(arc) through those points gives the line's radius at the arrow. The score is then taken against that line instead of the fitted ellipse.
`crops-L/` shows the points found (cyan), the detector's point (white +) and the refined tip (magenta).

**It finds the printed lines.** In AF bottom and AM top the cyan points sit on the gold/red edge and on the black 10 line.
It fitted a line for 20 of 48 arrows (13–29 points each).

**The fitted ellipse is off by about ±1.4 mm locally (sd), with no overall bias** (mean +0.1 mm; the 9/8 edge +1.2 mm on only 3 arrows). So a global correction (scaling the rings) would not help. Only a local fit can.

**But the score count does not move:**

| Shaft width counted (`CUTK`) | 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| L + cut (detector's point = centre of the hole) | 40 | 40 | 39 | 42 | 41 |
| A + L + cut (full-size shaft end) | 37 | 39 | 39 | 41 | 39 |
| A + ctr + L + cut | 40 | 41 | 39 | 40 | 39 |

The base is 40/48. The swings (39–42) don't follow the knob: single arrows near a line flip one way or the other. These are line cutters, and two errors of similar size decide each one:

1. **where the ring line is**: about ±1.4 mm, which L now removes, and
2. **where the hole is**, and which point of the shaft counts (end, centre of the hole, edge): about ±2 mm, which nothing here measures well yet.

Fixing (1) alone doesn't show while (2) is as large. The 48 arrows only give scores, not hole positions, so they can't tell which point convention is right.

**What would settle it:**
- Mark the true hole position (where the shaft enters the paper) for the ~20 arrows near a line, a few minutes of clicking on the crops. Then the point error is measured in mm, not by noisy right/wrong flips, and L and the tip convention can each be judged on their own.
- More photos, especially of line cutters.

## Hand-marked holes (`mark/`)

The hole centre (where the shaft enters the paper) was marked by hand on full-size crops for 45 of 48 arrows.
3 were skipped: AA middle and AD middle (the real arrow was not in the crop) and AH middle. Damaged paper made some marks hard, so they carry ~1 mm of noise.
Run with `node mark/eval_marks.mjs results-L.json mark/marks.json mark/manifest.json`. The page is `mark/index.html`, served by `node mark/serve.mjs 8091`.

**1. If the hole is known, the fitted rings are good enough, and the WA edge rule is the right one.** Scores from the marked hole:

| Rule | Right |
|---|---|
| hole centre, fitted rings | 37 / 45 |
| hole centre, local ring | 38 / 45 |
| **hole centre − half the shaft width (the WA line-cutter rule), fitted rings** | **42 / 45** |
| same, local ring | 41 / 45 |

Of the 3 misses, AJ bottom is the wrong sheet's spot. AM top and AP bottom are probably marks made hard by torn paper.
So the local ring fit is **not** needed: the ±1.4 mm local ring offsets are real, but they don't change scores once the hole is right.

**2. The bottleneck is where the detector puts the hole.** Detector point vs mark:
- Median distance 2.2 mm. Without the 4 big misses, the radial error has a bias of −0.5 mm, sd 2.4 mm and median |err| 1.3 mm.
- 4 arrows are 12–19 mm off (AC, AF, AI and AB middle). They still scored right only because they were far from a line.
  `mark/outliers.jpg` shows two: in AF the point fell into a dark torn hole, and in AC the tip search stopped at a white band on the shaft.
- The full-size tip (A, A+ctr) is not closer to the marks than the detector: mean |err| 2.9–3.4 vs 2.4 mm.

**3. What to do:**
- **Score with the edge rule:** the hole centre minus half the shaft width. On the true hole it is worth +5 arrows over the centre. The app scores the centre now.
- **Find the hole better.** Damaged paper (dark torn areas next to the shaft) and bands on the shaft are the failures here.
  This is where a learned detector can help, and `mark/` is already a labelling tool: these 45 marks are its first training and test data.

## The edge rule tried in the app (reverted)

The detector reported each shaft's hole radius (half its width / the spot's radius in px). The scan scored each arrow by the edge of its hole nearest the centre,
and stored that point in the end. On the 16 photos: **38/48, against 40/48 without it.**
Five arrows that were right went one ring too high (AF middle, AH top, AL bottom, AP top and bottom). All of them were already inside the right ring at the detector's point.

Why: the rule is right on the **true** hole (42/45 on the hand marks), but the detector's hole centre is already ~0.8 mm too far in, with ±2.4 mm of noise.
Taking another ~2.7 mm off pushes too many arrows over the line. The current placement (the centre of the hole, chosen on these photos)
has absorbed part of the line-cutter effect. So the edge rule has to come **together with** a more accurate hole position, not before it. The change was reverted.

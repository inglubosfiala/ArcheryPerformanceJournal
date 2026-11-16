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

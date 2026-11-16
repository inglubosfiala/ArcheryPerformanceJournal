# Scan failure split on real photos (2026-11-16)

This measures what kind of mistakes the photo scan makes, to decide whether a trained network is worth building.
It runs `measure.mjs` on the 16 photos in `tests/RealPhotos`: the 40 cm triple, 48 arrows, with the ground truth taken from the file names.
The detector is `photoDetect.js` as it is in the working tree, including the uncommitted changes, with its default options.

```
node measure.mjs <repo> <rawDir> results.json
```

`rawDir` is the output of `../scan-real-2026-11-16/decode.py tests/RealPhotos <rawDir>`.

**shift** is how far the found point would have to move to get the real score. One ring is 20 mm, and in the close-up 1 px is about 1 mm.
This is a lower bound on how far the point is from the real hole.

## Result

| Class | Arrows | Meaning |
|---|---|---|
| right | **35 / 48** | 9 of these are within 3 mm of a line |
| line | 10 | wrong, but the point is within 5 mm of the right ring (median ~2 mm) |
| off | 1 | wrong, 5–15 mm (AE middle, 9.4 mm) |
| lost | 2 | wrong, more than 15 mm: AD middle (an old hole in the gold was taken for the light-shafted arrow), AJ bottom (two sheets in one photo) |
| missing | 0 | |

Time per photo: 0.5–1.0 s (Node, laptop).

The earlier report (`../scan-real-2026-11-16/REPORT.md`) had 37/48 on the committed detector. The uncommitted changes cost 2 arrows on this set.

## What it means for a neural network

- Finding arrows is nearly solved. All 48 spots were found, no arrow was missing, and only 2 arrows (4 %) went to the wrong object.
  A network trained to find arrows could fix at most those 2–3 arrows. One of them (AJ, two sheets) is cheaper to fix with a layout check on the triple's spots.
- 10 of the 13 misses are line cutters about 2 mm (≈ 2 px) off. A keypoint network trained on a few hundred photos usually has an error of several pixels.
  It would not beat this, and could make it worse.
- So the remaining accuracy is in measuring the tip on the shaft (where it really ends, and the shaft's edge for the line-cutter rule) and in the pixels per ring,
  not in finding the arrow. See ideas 2–4 in the earlier report.

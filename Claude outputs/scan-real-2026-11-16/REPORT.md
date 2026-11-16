# Scan accuracy on real photos — 2026-11-16

Session: 18 m, 40 cm triple (`40t`, recurve scoring), 16 ends × 3 arrows = 48 arrows.
Ground truth is taken from the file names (`XY_top_middle_bottom.jpg`). The detector's X counts as 10.

## How it was run

The app's own photo path, outside the browser (`run.mjs`):

1. The JPEG is decoded and turned upright by its EXIF orientation (`decode.py`, 2252×4000).
2. **Whole look**: the whole photo at 640 px on its long side → `detectArrows(pic, '40t', 3)`.
3. **Close-up look**: the box around the found spots (margin 1.3) is cut from the full-size photo, again at 640 px, and detected again. It is kept when it finds the spots again (as `readPhoto` in `scan.js` does).

All 16 photos used the close-up. One difference from the app: the app shrinks with canvas
`drawImage`, the runner with an area average. The results may differ a little from the phone.

`overlay.py` draws the fitted rings (green) and each found arrow on the close-up: green = right score, magenta = wrong
(see `overlays/`).

## Result

| | |
|---|---|
| Arrows scored right | **37 / 48 (77 %)** |
| Off by one ring | 9 |
| Off by 2 or more | 2 (both are the wrong arrow or the wrong sheet) |
| Ends with all 3 right | 7 / 16 |
| Session total | detector 442 vs real 444 (−2): the errors mostly cancel out |
| Spots found | 48 / 48: the rings fit the printed rings well in every photo |
| Time | ~0.7–1.1 s per photo (Node, laptop) |

| Photo | Real | Read | Wrong |
|---|---|---|---|
| AA | 10 9 10 | 10 **8** 10 | middle |
| AB | 8 8 10 | 8 8 10 | |
| AC | 9 10 7 | 9 10 **6** | bottom |
| AD | 9 7 10 | 9 **10** 10 | middle (old hole) |
| AE | 9 10 10 | 9 10 10 | |
| AF | 10 8 9 | 10 8 **8** | bottom |
| AG | 9 10 10 | **8** X **9** | top, bottom |
| AH | 9 10 10 | 9 X X | |
| AI | 10 10 10 | X X X | |
| AJ | 10 10 8 | 10 X **10** | wrong sheet |
| AK | 9 8 9 | 9 8 9 | |
| AL | 10 10 7 | 10 10 7 | |
| AM | 10 10 9 | **9** 10 9 | top |
| AN | 10 10 9 | **9** X 9 | top |
| AO | 9 10 9 | **8** 10 **10** | top, bottom |
| AP | 8 9 9 | 8 9 9 | |

## What goes wrong

### 1. Line cutters: 9 of the 11 misses (positional noise, not a bias)

Each missed arrow was 0.00–0.07 spot radii from the ring line it should be on. That is 0–7 mm on
paper, most of them under 4 mm. The set is hard: **20 of the 48 arrows sit within 3 mm of a line**.

The errors go both ways: 7 too far out, 2 too far in. Some arrows close to the 9/8 line are 8
at d = 0.401, 0.406 and 0.414, and others are 9 at d = 0.419 and 0.420. So no constant offset fixes it.
A "line cutter allowance" (counting the shaft's thickness) was swept from −0.03 to +0.05.
Each value fixes some arrows and breaks as many: 0.00, as now, is the best (37/48).
The `shaftGap` sweep (2, 3, 4, 6, 8 px) also peaks at the current default (37/48).

What causes the noise, seen on the overlays:
- **The point runs on past the shaft's tip** (AG top and bottom, AO bottom). The dark run goes on
  over old holes lined up with the shaft, or over the shaft's shadow. `trimPoint` misses these when the
  hole is close to the tip.
- **The point stops short of the tip** (AF bottom, AM top). A light or shiny stretch of the shaft
  near the paper breaks the dark run.
- The point is the middle of the shaft, but the score depends on whether the shaft *touches* the line.

### 2. A shaft that comes out pale in the photo is missed (AD middle, AA middle)

All the arrows are the same. On the middle spot the shaft sticks out sideways, nearly flat across the
picture, and comes out pale (grey/beige) in the photo, probably from the hall lights reflecting off it. In AD the
dark-line search didn't find it, so the old torn hole in the gold won (10 instead of 7).
In AA the point landed off the shaft (8 instead of 9).

### 3. The spots come from two sheets (AJ)

Two triple sheets hang side by side, and the photo is cut off at the bottom. The detector took the three
biggest spots: left top, right top and left middle. The real sheet's bottom spot was not in the picture.
Nothing checks that a triple's three spots lie in a column at their real spacing (1.1 diameters).

## Re-run with AA and AJ split to the scored sheet

Two photos show both sheets with arrows on them: AJ completely, and AA with part of the next sheet. Each was cut to the sheet the
scores in its file name belong to (`split/`, `overlays/*_split.jpg`): AA to the left sheet, AJ to the right one.

| Photo | Real | Before | Split |
|---|---|---|---|
| AA | 10 9 10 | 10 **8** 10 | 10 **7** 10 |
| AJ | 10 10 8 | 10 X **10** (the left sheet's spots) | 10 **9** 8 |

- AJ: all three spots are now the right sheet's, and the 8 at the bottom is found. The middle arrow
  now shows failure 1: the shaft comes in from the lower right, and its point runs on across the middle
  to the 9 on the far side.
- AA: the middle arrow is the pale shaft again (failure 2). The point went onto the orange fletching (7) instead of the shaft's tip
  on the 9/8 line.

The total is still **37 / 48** (now 438 vs 444). Splitting fixes the spot choice, but it shows the same two
weaknesses in finding the point. The other 14 photos found one column of spots, even where part
of the next sheet shows.

## Label fix

`AO_9_10_9` was named wrongly: the bottom arrow is a 10 (`AO_9_10_10`). With that fixed, the old detector
scores **38 / 48** (its "AO bottom" miss was really a hit). The numbers above are from before the fix.

## Shaft tip finding (change in `photoDetect.js`)

Zoomed views of each miss (`zoom/`) showed two things:

- **The run goes on past the shaft (AG, AJ, AM, AO).** The dark run continued 3–8 px past where the shaft
  ends: onto the black ring line, the shaft's shadow, or an old hole next to the point.
- **The visible end is not the arrow.** The end of the shaft in the picture is the far edge of its hole.
  The arrow (the hole's centre) is half the shaft's width back.

What changed, in `findShafts`:

1. **`shaftEnd`**: after `trimPoint`, the shaft's width is measured across its solid stretch. Then the
   walk goes from there to the point: the shaft ends where less than half of the middle of that band is dark.
   A ring line, a shadow or a hole beside the line covers too little of the band to carry the end on.
   A pale gap (glare) of up to half the shaft's width, at least 3 px, is crossed when at least 3 half
   widths of solid shaft follow it. A shorter dark bit is an old hole.
2. **The arrow goes at the hole's centre**: half the shaft's width back from the end, along the shaft.

Evaluated on the 48 arrows (AA and AJ cut to one sheet, AO fixed). The search over settings (`sweep.mjs`) ran
on the saved close-ups:

| Version | Right |
|---|---|
| Before | 38 / 48 |
| Tip search only | 36 / 48 |
| Tip search + hole centre | **41 / 48** |
| + line-cutter rule (score by the shaft's edge) | 39 / 48: dropped |

The result is stable, not a lucky setting: 122 of the 243 combinations tried scored 41. What decides it
is the hole-centre shift (0.5 shaft widths: 38.5 on average, 1–1.5: 40.5–40.8). Coverage, band, bridge and
"after" barely matter.

Arrow by arrow: **5 fixed** (AC bottom, AG bottom, AJ middle, AN top, AO top), **2 broken**
(AL middle, AP middle).

### The 7 misses left (`zoom-tip/`)

- **4 × a shaft that comes out pale** (AA, AD, AL, AP, always the middle spot). All the arrows are the same; there,
  the shaft lies nearly flat across the picture and comes out grey/beige (probably reflected light), so it is only partly
  "dark" over the gold. The search stops short or takes the fletching (AA), or misses the shaft and takes an old
  hole (AD: 10 instead of 7). This is now the biggest single error.
- **3 on the line** (AF bottom, AG top, AM top), all one ring too low, the point within ~0.02 of the line.
  Scoring by the shaft's edge would fix these, but costs as many elsewhere (above).

Tests: the synthetic shaft in `tests/photoDetect.test.js` now ends in a round hole centred on the entry
point, as on a real photo. A new test checks that the arrow is placed at the hole's centre, not past it
(the old code was 0.010–0.014 past it). All tests pass.

## Ideas for fine tuning, most promising first

1. **Check the triple's layout** (cheap, robust). Keep only three spots that make a column at
   about 2.2 spot radii apart, of about the same size. Otherwise report "partial". This would have
   fixed AJ (or told the archer to take the photo again).
2. **Find the tip along the shaft more carefully.** Once the shaft line is known, walk along it and look at how wide
   the dark area is and what colour it is. The shaft is a steady width; holes are blobs. End the run where the steady
   width ends. A sub-pixel fit would also help: 1 px ≈ 0.01 radius in the close-up.
3. **Score on the shaft's edge, not its middle.** Take the shaft's width in the picture: the edge nearest the middle of the
   spot decides the score (the WA line-cutter rule). This needs (2) first, or it adds noise.
4. **A third look on each spot** (a 640 px close-up of each spot, as spot by spot does live). This gives ~2.5×
   the pixels per ring and should shrink the ±3 mm noise. The cost is ~3× the time.
5. **Pale shafts** (a shaft that comes out light in the photo): let a coloured, non-dark straight run count as a shaft. The blob branch already
   tries this, but `2·b < 0.07·spotPx` drops it. Tune that on AD / AA.

These photos make a good regression set. A test (or this runner) could take
`tests/RealPhotos/*.jpg` and fail when accuracy drops below 37/48. But 36 MB of JPEGs would need to be kept
out of git, or shrunk to the close-up crops.

## Files

- `run.mjs`: the batch runner (`node run.mjs <repo> <rawDir> <out.json> 40t`; env `GAP` sets `shaftGap`)
- `decode.py`: JPEG → raw RGBA + `meta.json`
- `overlay.py`: draws the overlays from `results.json`
- `results.json`: both looks per photo: spots, arrows (face coords, picture coords, shaft/blob), scores
- `overlays/*.jpg`: the close-up with fitted rings and the found arrows
- `eval.mjs`: the eval over a meta list (`node eval.mjs <repo> <meta.json> <out.json> [debugDir]`; env `OPTS` passes detector options)
- `sweep.mjs`: detector options over the close-ups saved by `eval.mjs` (fast, no resampling)
- `zoom.py`: zoomed views of each arrow: the picture as analysed, the dark mask, the shafts and the point
- `zoom/`, `zoom-tip/`: the misses before and after the tip change; `results-tip.json`: the final run

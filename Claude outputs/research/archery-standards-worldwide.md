# Archery standards worldwide: faces, scoring, rounds, and how they map onto the app

Researched 2026-11-16 for the Archery Performance Journal PWA. This is research only. No code was changed.

**How to read the sources.** Every claim is tagged with a source key such as **[WA-B2 7.2.2.3]**, listed in §4.
- **Primary** means the owning body's own rulebook or website.
- **Codified** means `archeryutils`. This open-source library is used to compute Archery GB handicaps and classifications, and it stores every round and face as data. I used it where the owning body's document could not be fetched. archerygb.org returned HTTP 403 to automated fetches, so the **Archery GB facts are codified or secondary, not primary**. Check them against the Rules of Shooting PDF before you implement them.
- **Secondary** means a club or retailer page, an encyclopedia, or similar. These are flagged where they occur.

All geometry uses the app's convention: a **radius fraction** is the outer edge of a scoring zone divided by the face radius. The face edge is 1.0.

---

## 1. Summary

**Key findings**

1. **Concentric 10-zone faces are only part of the picture.** World Archery target faces use 10 rings of equal width plus an X. The app models that exactly. Most other formats differ in one or more of these ways:
   - the rings are not of equal width, as on WA field and NFAA/IFAA field faces;
   - the values are not sequential, as in Archery GB imperial 9-7-5-3-1;
   - the values depend on the division, as in compound inner-10 scoring;
   - the values depend on the arrow's order, as in IFAA/NFAA animal rounds and the WA Forest round;
   - the zones are not concentric, as on 3D targets.
2. **Almost every paper face fits one model:** an ordered list of `{edgeFraction, value, colour}` zones. This is the same idea as archeryutils' `FaceSpec`, a "ring diameter → score" map **[AU-targets]**. A face defined this way can also drive the published handicap math (expected score from ring sizes) **[AU-hs]**.
3. **Two current WA rules affect the app now:**
   - **Compound at 18 m and 25 m:** only the inner 10 (2 cm on the 40 cm face, 3 cm on the 60 cm face) scores 10. The rest of the gold scores 9 **[WA-B2 7.2.2.3]**.
   - **Tie-breaks at short distances (indoor):** ties go on 10s, then 9s. At long distances they go on Xs, then 10s **[WA-B3 12.5.1]**.

   The app's spot faces score both "X" and "10" as 10, which is correct for recurve and barebow but wrong for compound indoors.
4. **The app's `DISTANCES` list is missing 40 m and 90 m.** 40 m is used for U15 rounds and 90 m in the 1440 Round. The list also has no way to record yards or the free distances used in field and 3D **[WA-B2 4.5.1.1] [WA-B6 48.1.1]**.

**Organisations and formats at a glance**

| Body / format | Discipline | Faces | Values (centre → out) | Fits the current model? |
|---|---|---|---|---|
| World Archery target | outdoor and indoor target | 122 / 80 / 60 / 40 cm, 6-ring and 5-ring subsets, triple and double sheets | X, 10…1 (compound indoors: inner 10 = 10, outer gold = 9) | Yes, except compound scoring and the 60 cm triple and 40 cm double sheets |
| WA field | field | 20 / 40 / 60 / 80 cm, yellow with black or teal | 6, 5, 4, 3, 2, 1 (rings not of equal width) | Needs a zone table |
| WA 3D | 3D | animal targets | 11, 10, 8, 5 | Needs a non-concentric (keypad) mode |
| WA clout | clout | 15 m circle on the ground | 5…1 | Zone table (equal widths) |
| WA Forest round | field (animal pictures) | picture faces with an inner and an outer ring | 15/12, 10/7, 5/2 by arrow order | Needs arrow-order scoring |
| WA flight | flight | none (distance shot) | distance | Not a scoring face |
| WA ski and run archery | biathlon-style | 16 cm hit zones | hit or miss | Hit/miss face |
| WA para (VI) | target | 122 cm at 30 m, 60 cm at 18 m | as WA target | Yes (needs a 30 m distance option) |
| Archery GB imperial | outdoor target | 122 cm | 9, 7, 5, 3, 1 | Zone table (equal widths, values not sequential) |
| Archery GB indoor | indoor target | 40 / 60 / 80 cm WA faces; Worcester 16 in | as WA, or 5…1 (Worcester) | Mostly yes; Worcester needs a zone table |
| NFAA | indoor, field, hunter, animal, 3D | 40 cm blue face and 5-spot; 20 / 35 / 50 / 65 cm field and hunter faces; animal faces | 5…1 with X; 5-4-3 with X; 21/20/18 by arrow order | Zone table, plus arrow-order scoring for animal |
| Vegas / Lancaster | indoor | WA 40 cm triangular 3-spot | 10…6; Lancaster X = 11 | Zone table (custom value for the X) |
| IFAA | field, hunter, expert, animal, 3D, indoor, flint | the same face sizes and blue indoor face as NFAA | 5-4-3, expert 5…1, 20/16/10, 10/8/5 | Zone table, arrow order, 3D |
| IBO | 3D, IBO field | animals; 16 in foam cores | 11, 10, 8, 5; 13 / 10 / 8 / 5 | 3D keypad; IBO field needs a zone table |
| ASA | 3D | animals | 14, 12, 10, 8, 5 (called upper 12) | 3D keypad plus a "called" flag |
| Kyudo | traditional | 36 cm kasumi-mato at 28 m | hit or miss | Hit/miss face |
| Horseback (Hungarian style) | mounted | 90 cm face | 4-3-2 or 5…1, plus a time bonus | Low priority |

---

## 2. Per-standard detail

### 2.1 World Archery: target archery (the app's baseline, with gaps noted)

**Faces** **[WA-B2 7.2.2, 7.2.2.1–7.2.2.3]**
- **16 face types:**
  - 122 cm and 80 cm faces, plus the 80 cm 6-ring face (zones 10…5);
  - 60 cm face, plus 60 cm triangular triple and 60 cm vertical triple faces;
  - 40 cm face, plus 40 cm triangular and vertical triple faces, each in a regular, -R and -C version;
  - 40 cm vertical double face (regular, -R and -C), used for the 18 m mixed team.
- **Rings:** 10 rings of equal width. Each ring's width is 6.1 cm on the 122 cm face, 4 cm on the 80 cm face, 3 cm on the 60 cm face and 2 cm on the 40 cm face. **Every ring edge sits at a radius fraction of k/10**, which matches the app's `perRadius: 10`.
- **Colours and values:** gold 10/9, red 8/7, light blue 6/5, black 4/3, white 2/1 (Pantone 107U, 032U, 306U, Process Black). This matches `zoneOf()`.
- **Inner 10 (X):**

  | Face | X diameter | Radius fraction |
  |---|---|---|
  | 122 cm | 6.1 cm | 0.05 |
  | 80 cm | 4 cm | 0.05 |
  | 60 cm (compound ring) | 3 cm | 0.05 |
  | 40 cm (compound ring) | 2 cm | 0.05 |

  The app's `x: 0.05` for full faces is right.
- **-R and -C triple faces:** the 40 cm-R triple has a 4 cm 10 ring, the -C has a 2 cm 10 ring, and the combined face shows both. Gold centres are about 22 cm apart. The triangular layout is bottom-left, top, bottom-right. The double face is two spots in a vertical row, also 22 cm apart.
- **Line rule:** an arrow touching a line takes the higher value **[WA-B3 12.2]**. The app treats a tap exactly on a line as the lower ring. That is reasonable for a tap at the arrow's centre, but it ignores the shaft radius (see §3.4).

**Compound inner-10 rule** **[WA-B2 7.2.2.3]**
- For the Compound division on the 60 cm and 40 cm faces, **only the inner 10 ring scores 10, and the rest of the gold scores 9**.
- The W1 division uses the recurve 40 cm ring.
- Expressed as zones on a full face: `[{0.05→10}, {0.2→9}, {0.3→8}, … {1.0→1}]`; on a 10–6 spot: `[{0.1→10}, {0.4→9}, {0.6→8}, {0.8→7}, {1.0→6}]`. The outer 10 ring and the 9 ring both score 9; every ring from 8 out scores as printed. archeryutils encodes this as `10_zone_compound` (checked against its `gen_face_spec`, 2026-11-16) **[AU-targets]**. *(Corrected: an earlier draft said every ring scored one less.)*

**Tie-breaks** **[WA-B3 12.5.1]**
- Long distances: Xs, then 10s.
- Short distances (indoor): 10s, then 9s. Scorecards record "10s and Xs (or 9s for short distance events)" **[WA-B3 12.4]**.

**Standard rounds** **[WA-B2 4.5.1, WA-B6 48.1]**

| Round | Distance / face | Arrows | Max |
|---|---|---|---|
| 70 m round (recurve) | 70 m, 122 cm | 72 (ends of 6) | 720 |
| 60 m round (recurve U18 and 50+) | 60 m, 122 cm | 72 | 720 |
| 50 m round (compound) | 50 m, 80 cm or 80 cm 6-ring | 72 | 720 |
| 50 m round (barebow) | 50 m, 122 cm | 72 | 720 |
| U15 | 40 m, 122 cm (recurve) / 80 cm (compound); 30 m, 122 cm (barebow U15) | 72 | 720 |
| 18 m round | 18 m, 40 cm or 40 cm triple | 60 (ends of 3) | 600 |
| 25 m round | 25 m, 60 cm or 60 cm triple | 60 | 600 |
| Combined | 18 m + 25 m | 120 | 1200 |
| 1440 Round (men) | 90/70/50/30 m, 36 arrows each; 122 cm at 90/70 m, 80 cm at 50/30 m | 144 | 1440 |
| 1440 (women, U21 W, U18 M, 50+ M) | 70/60/50/30 m | 144 | 1440 |
| 1440 (U18 W, 50+ W) | 60/50/40/30 m | 144 | 1440 |
| 900 Round | 60/50/40 m, 30 arrows each, 122 cm | 90 | 900 |
| Standard Round (Standard Bow) | 50 m + 30 m, 36 arrows each, 122 cm, ends of 3 | 72 | 720 |
| 50 m Match Round (club) | 27 ranking arrows + 7 × 9 match arrows at 50 m, 122 cm | 90 | 900 |
| Double rounds | 2 × 70 m, 2 × 50 m, 2 × 60 m, 2 × 1440 | — | — |

**Matches** **[WA-B2 4.5.1.2]**
- Individual recurve and barebow: set system, 5 sets of 3 arrows.
- Compound: cumulative, 5 ends of 3 arrows.
- Teams: 4 sets/ends of 6 arrows. Mixed teams: 4 of 4 arrows.

### 2.2 World Archery: para and visually impaired **[WA-B5 Ch.28, 4.5 tables]**

- **VI 1, VI 2 and VI U21:**
  - outdoors: 30 m on the 122 cm face, 72 arrows;
  - indoors: 18 m on the 60 cm 10-ring face.
- VI archers must use a tactile sight **[WA-B5 34.4.2]**.
- **W1:** 50 m on the 80 cm 10-ring face (not the 6-ring), and the recurve 40 cm ring indoors.
- **Para Compound:** 50 m on the 80 cm 6-ring face.
- **Para Recurve:** 70 m on the 122 cm face.
- **App impact:** only a 30 m distance and the existing faces are needed. No new face geometry.

### 2.3 World Archery: field **[WA-B2 8.2.1, 4.5.2; WA-B4 22.2–22.3]**

**Faces:** 20, 40, 60 and 80 cm.
- A yellow centre split into 6 (inner) and 5 (outer). Around it, four equal black or teal zones (yellow/teal is mandatory at World and Continental Championships).

| Value | Colour | Diameters for the 20 / 40 / 60 / 80 cm face (cm) | **Radius fraction** |
|---|---|---|---|
| 6 | yellow | 2 / 4 / 6 / 8 | **0.1** |
| 5 | yellow | 4 / 8 / 12 / 16 | **0.2** |
| 4 | black or teal | 8 / 16 / 24 / 32 | **0.4** |
| 3 | black or teal | 12 / 24 / 36 / 48 | **0.6** |
| 2 | black or teal | 16 / 32 / 48 / 64 | **0.8** |
| 1 | black or teal | 20 / 40 / 60 / 80 | **1.0** |

- **The rings are not of equal width.** The 6 and 5 rings are half as wide as the others.
- **There is no X.** Ties go on the number of 6s, then 5s **[WA-B4 22.3.1]**.
- Line touch scores the higher value **[WA-B4 22.2]**.
- If an athlete shoots more than one arrow into the same 20 cm face, only the lowest of those arrows scores **[WA-B4 22.2.4]**.

**Layout on the butt** **[WA-B2 8.2.1.3]**
- 20 cm faces: 12 per butt, in 4 columns of 3.
- 40 cm faces: 4 per butt.
- 60 cm faces: a double setup is recommended on marked rounds.
- 80 cm faces: one per butt.

**Round** **[WA-B2 4.5.2]**
- 24 targets × 3 arrows = 72 arrows. Max **432**.
- The round is two 12-target units, each marked, unmarked, or one of each.
- **Marked unit, red peg (recurve and compound), 3 targets per face size:**

  | Face | Distances (m) |
  |---|---|
  | 20 cm | 10, 15, 20 |
  | 40 cm | 20, 25, 30 |
  | 60 cm | 35, 40, 45 |
  | 80 cm | 50, 55, 60 |

- **Marked unit, blue peg (barebow, traditional, recurve U18, compound U18):**

  | Face | Distances (m) |
  |---|---|
  | 20 cm | 5, 10, 15 |
  | 40 cm | 15, 20, 25 |
  | 60 cm | 30, 35, 40 |
  | 80 cm | 40, 45, 50 |

- **Marked unit, yellow peg (barebow U18, longbow):**

  | Face | Distances (m) |
  |---|---|
  | 20 cm | 5, 10, 15 |
  | 40 cm | 10, 15, 20 |
  | 60 cm | 20, 25, 30 |
  | 80 cm | 30, 35, 40 |

- **Unmarked unit:** 2 to 4 targets per face size. Red-peg ranges are 10–15, 15–25, 20–35 and 35–55 m.
- **Arrowhead Round:** 24 or 48 targets **[WA-B6 48.2.2]**.

### 2.4 World Archery: 3D **[WA-B2 8.2.2, 4.5.2.3; WA-B4 22.2–22.3]**

- **Targets:** 3D animal targets. Sizes and zones are **not standardised**.
- **Scoring zones:**
  - **11:** the small circle in the centre of the 10 ring;
  - **10:** the larger circle within the vital area;
  - **8:** the vital area outside the 10 circle;
  - **5:** the rest of the body colour.
- **Hits that score a miss:** horns, hooves or other defined non-scoring areas (unless the arrow touches body colour), and glance-offs. A tail or wing hit on a bird scores.
- **Disputed arrows:** if the group cannot agree, the arrow scores 5. A ricochet is a miss.
- **Round:** 24 targets × 2 arrows, all unmarked. Max **528**. Ties go on 11s, then 10s.
- **Distances:** compound 5–45 m on the red peg. Barebow, longbow and traditional 5–30 m on the blue peg.

### 2.5 World Archery: miscellaneous rounds **[WA-B6]**

**Forest Round (48.2.1)**
- Unmarked. 12–24 targets (a multiple of 4).
- Picture faces of animals. Each has an X ring, a larger inner ring (the high zone), and the body outline as the outer zone.
- Inner-ring sizes are 7.5/5, 15/10, 22.5/15 and 30/20 cm.
- **The archer shoots up to three arrows and only the first hit scores:**

  | Arrow | Inner ring | Outer ring |
  |---|---|---|
  | 1st | 15 | 12 |
  | 2nd | 10 | 7 |
  | 3rd | 5 | 2 |

- An optional 3D-style single-arrow scoring uses X = 15, inner = 12, outline = 7.

**Clout (48.3)**
- The target is a 15 m circle on the ground with **5 zones, each 1.5 m wide**, scoring 5, 4, 3, 2, 1. In app terms that is 5 equal rings, edges at 0.2 … 1.0.
- An arrow in the flag pole scores 5.
- **Round:** 36 arrows in ends of 3 or 6. Max **180**.
- **Distances:** recurve 165 m (men) and 125 m (women); compound 185 m (men) and 165 m (women).
- **Ties:** the fewest misses, then the fewest 1s, and so on.

**Flight (48.4)**
- Ends of 6 arrows shot for maximum distance, in divisions by bow type and draw weight.
- **There is no target face.** The app would log distances only.

**Run archery (Ch.49)**
- Shooting is at 18 m. Each arrow has its own circular hit zone, **16 cm in diameter with a 3 cm centre**, and zones are 25 cm apart.
- The result is hit or miss. Each miss means a penalty loop.
- The archer shoots 4 arrows per end (4K individual) or up to 6 (sprint).

**Ski archery (Ch.50)**
- Shooting is at 18 m, at a **16 cm** hit zone.
- Each miss means a penalty loop of 150 m, or 1 minute in the individual competition.

### 2.6 Archery GB (UK)

**Primary source not fetchable here.** The Rules of Shooting PDF **[AGB-RoS]** returned HTTP 403. Rounds and faces below come from the archeryutils round files **[AU-AGB]**, with some club-page detail flagged as secondary. **Verify against the Rules of Shooting (Part 3 outdoor, Rule 308 outdoor rounds, Rule 405 indoor rounds).**

**Imperial 5-zone scoring (outdoor imperial rounds)**
- The face is the standard 122 cm WA face.
- **Scoring is per colour, not per ring:** gold 9, red 7, blue 5, black 3, white 1 **[AU-targets `5_zone`]**.
- Zone edges in radius fractions are **0.2, 0.4, 0.6, 0.8, 1.0**: equal widths with values that step by 2.
- The X is not used. By common practice, ties go on hits, then golds (secondary).
- Imperial rounds are traditionally shot in ends of 6, scored by the dozen (secondary).

**Imperial rounds** **[AU-AGB `AGB_outdoor_imperial.json`]**

All are on the 122 cm face with 5-zone scoring. Max = 9 × arrows.

| Round | Distances (yd), arrows at each | Arrows | Max |
|---|---|---|---|
| York | 100 / 80 / 60 yd: 72 / 48 / 24 | 144 | 1296 |
| Hereford = Bristol I | 80 / 60 / 50 yd: 72 / 48 / 24 | 144 | 1296 |
| Bristol II | 60 / 50 / 40 yd | 144 | 1296 |
| Bristol III | 50 / 40 / 30 yd | 144 | 1296 |
| Bristol IV | 40 / 30 / 20 yd | 144 | 1296 |
| Bristol V | 30 / 20 / 10 yd | 144 | 1296 |
| St George | 100 / 80 / 60 yd, 36 each | 108 | 972 |
| Albion | 80 / 60 / 50 yd, 36 each | 108 | 972 |
| Windsor (50 / 40 / 30 variants) | 60 / 50 / 40 yd, 36 each (each variant steps down 10 yd) | 108 | 972 |
| New Western / Long Western / Western | 100+80 / 80+60 / 60+50 yd, 48 each (plus Western 50 / 40 / 30) | 96 | 864 |
| New National / Long National / National | 100+80 / 80+60 / 60+50 yd, 48 + 24 (plus National 50 / 40 / 30) | 72 | 648 |
| New Warwick / Long Warwick / Warwick | as National, 24 + 24 | 48 | 432 |
| American | 60 / 50 / 40 yd, 30 each | 90 | 810 |
| St Nicholas | 40 yd × 48 + 30 yd × 36 | 84 | 756 |

**Indoor and other rounds** **[AU-AGB `AGB_indoor.json`, `Miscellaneous.json`]**

| Round | Spec | Arrows | Max |
|---|---|---|---|
| Portsmouth | 20 yd, 60 cm WA 10-zone (triple and compound variants) | 60 | 600 |
| Bray I | 20 yd, 40 cm 10-zone | 30 | 300 |
| Bray II | 25 yd, 60 cm 10-zone | 30 | 300 |
| Stafford | 30 m, 80 cm 10-zone | 72 | 720 |
| Worcester | 20 yd, **16 in (40.6 cm) face, 5 equal rings scoring 5…1** (white centre, black outer, per secondary sources); 5-spot variant has 2 rings (5, 4) | 60 | 300 |
| Vegas (AGB listing) | 18 m, 40 cm triple (5-ring) | 60 | 600 |
| Frostbite | 30 m, 80 cm 10-zone | 36 | 360 |

- **Compound:** each of these rounds has a compound variant that uses inner-10 scoring (`10_zone_compound`).
- **VI "Burntwood" rounds** **[AU-AGB `AGB_VI.json`]:** imperial rounds re-cast for VI archers. Every distance is 30 m, and the face size increases instead (40 → 60 → 80 → 122 cm).

**Classification and handicaps (pointer only)**
- **Handicap:** Archery GB uses a descending handicap (lower is better). The current scheme is J. Atkinson's 2023 scheme, which replaced D. Lane's scheme.
- **How it works:** a handicap sets the archer's angular group spread. The expected score on a round is then computed from that spread and **the ring diameters of each face**. The scoring zones therefore have to be known as data **[AU-hs] [AU-agb] [Lane-2013]**.
- **Classifications** are set as handicap thresholds by bow type, age and gender. Archery GB publishes the classification tables (for example [outdoor recurve tables](https://archerygb.org/files/outdoor-classification-tables-recurve-300724141009.pdf), also returned 403 here).

### 2.7 NFAA (USA, National Field Archery Association) **[NFAA-VI]**

**Indoor round (Art. VI E), the "300 round"**
- 60 arrows at 20 yd, in 3 games of 4 ends of 5 arrows.
- **Standard face:** 40 cm, dull blue. White lines separate the zones. The spot is two white rings with a blue X: the **bullseye is 8 cm and the X is 4 cm**.
- **Scoring:** 5, 4, 3, 2, 1 from the spot out. Max **300**. Xs are counted as tie-breakers.
- **Geometry:** the same ring lines as the WA 40 cm face, with zones paired. The X edge is at 0.1, and the 5/4/3/2/1 edges are at **0.2, 0.4, 0.6, 0.8, 1.0**. This is the app's existing spot `ringRule` (`x 0.1, perRadius 5`) with different values and colours.
- **5-spot face:** 5 spots arranged like the five on a die. On each spot, the X (4 cm) and white ring (8 cm) score 5, and the blue rings out to 16 cm score 4. Per-spot radius fractions are X 0.25, 5 at 0.5, 4 at 1.0. One arrow goes in each spot, in any order. (The 5-spot sizes are confirmed in **[IFAA-BoR V.J]**, which uses the same face.)
- **Vegas alternates:** the 40 cm face (10…1, or 10…6 on the 3-spot), in games of 5 ends × 3 arrows. 2, 3 or 4 games give the **Vegas 300, 450 or 600**.

**Field and hunter faces (Art. VI A–B)**
- Sizes: 65, 50, 35 and 20 cm.
- **Field face:** a black spot with a white X, two white rings and two black rings.

  | Face | X | Spot | Inner white | Outer white | Inner black | Outer black |
  |---|---|---|---|---|---|---|
  | 65 cm | 6.5 | 13 | 26 | 39 | 52 | 65 |
  | 50 cm | 5 | 10 | 20 | 30 | 40 | 50 |
  | 35 cm | 3.5 | 7 | 14 | 21 | 28 | 35 |
  | 20 cm | 2 | 4 | 8 | 12 | 16 | 20 |

  All diameters are in cm. In radius fractions: X 0.1, spot 0.2, whites 0.4 and 0.6, blacks 0.8 and 1.0.
- **Scoring:** spot = 5, both whites = 4, both blacks = 3. **The zones are not of equal width** (edges at 0.2, 0.6, 1.0).
- **Professional divisions** add a 1-point X bonus (6 per arrow).
- **Alternate "Expert" scoring** uses all the lines: 5, 4, 3, 2, 1 with edges at 0.2 … 1.0.
- **Hunter face:** all black with a white spot and a black X. The edges are the same: X 0.1, spot 0.2, inner ring 0.6, face edge 1.0. Scoring is the same 5-4-3.
- **Rounds:** each unit is 14 targets × 4 arrows; a round is 28 targets (112 arrows). Max **560**.
  - Field distances are 15–80 yd, including fans and walk-ups.
  - Hunter distances are 11–70 yd, at uneven distances.
- **International round (Art. VI D):** 20 targets × 3 arrows, hunter faces. Max **300**.
- **Flint indoor (Art. VI F):** 7 targets per unit on 20 and 35 cm faces at 20 ft – 30 yd. Field scoring applies.

**Animal round (Art. VI C)**
- Animal faces have an oblong high-scoring area, a low-scoring area out to the hide-and-hair line, and a **bonus dot** in the high area (+1).
- **Target groups:**

  | Group | High-area size | Distances |
  |---|---|---|
  | 1 | 8¾ × 14¼ in | 60–40 yd walk-up |
  | 2 | 6¾ × 10¼ in | 45–30 yd |
  | 3 | 4¼ × 6¾ in | 35–20 yd |
  | 4 | 2 × 3⅜ in | 20–10 yd |

- Up to 3 marked arrows per target:

  | Arrow | Dot | High area | Low area |
  |---|---|---|---|
  | 1st | 21 | 20 | 18 |
  | 2nd | 17 | 16 | 14 |
  | 3rd | 13 | 12 | 10 |

  The page lists the values in this order. Mapping them as dot / high / low is my reading of that order.
- Max **588** for 28 targets. This is derived (21 × 28).
- NFAA also runs "Modern" field/hunter/animal rounds and 3D rounds **[NFAA-modern] [NFAA-3D]**.

**NFAA handicap (pointer)**
- The handicap is computed on official field and/or hunter rounds as **80 % of the difference between the archer's average and the perfect score**, using NFAA tables **[NFAA-hc]**.

### 2.8 USA Archery and US indoor formats

- **USA Archery** sanctioned events follow the World Archery rules **[USAA-col]**. JOAD has its own event formats **[USAA-JOAD]**. No separate face geometry was found.
- **Lancaster Archery Classic** (a commercial event, not a governing body):
  - 60-arrow qualifying round on the 40 cm WA 3-spot at 18 m. The 18 m distance is secondary; the press release confirms it only for the youth event.
  - **The X (inner 10) scores 11**, so a perfect score is **660**.
  - Shoot-up finals add a called **12 ring, 1.5 cm across**, placed between the 7 and 8 rings **[LAS-2022]**.
- **The Vegas Shoot** (NFAA) uses the 40 cm triangular 3-spot, scored 10…6 (secondary; see NFAA Vegas alternates above).

### 2.9 IFAA (International Field Archery Association) **[IFAA-BoR Art. V]**

IFAA is active in Europe, including Hungary (MISZ), Germany (DFBV) and the Nordic countries. The rules come from the Book of Rules 2021-2022 (rev. 4 Apr 2021, still the current edition on ifaa-archery.org), supplemented by Executive Clarifications dated 2026-06-01.

**Field Round (V.A)**
- The face has a black spot, a white inner ring and a black outer ring. Sizes are 20 / 35 / 50 / 65 cm.

  | Face | Spot (5) | Inner ring (4) |
  |---|---|---|
  | 20 cm | 4 cm | 12 cm |
  | 35 cm | 7 cm | 21 cm |
  | 50 cm | 10 cm | 30 cm |
  | 65 cm | 13 cm | 39 cm |

- Edges in radius fractions are **0.2, 0.6, 1.0**: the same as the NFAA field and hunter faces.
- **Scoring:** 5 / 4 / 3.
- **Round:** 14-target units × 4 arrows; a round is 28 targets (112 arrows). Max **560**. Distances run from 20 ft to 80 yd.
- **Hunter Round (V.B):** an all-black face with a white spot, same dimensions and same 5-4-3 scoring. Distances run to 70 yd, at uneven distances.
- **Expert Field Round (V.H):** each of the 5, 4 and 3 zones is split by a line through its middle. Scoring is **5, 4, 3, 2, 1** (edges 0.2, 0.4, 0.6, 0.8, 1.0). A white "X" in the spot is used for tie-breaks only.
- **International Round (V.G):** 20 targets × 3 arrows on hunter faces (35, 50, 65 cm). Max **300**.

**Animal Round (V.C marked, V.D unmarked)**
- Animal faces (or 3D targets for unmarked rounds) with an oblong high area and the area out to the hide-and-hair line.

  | Group | High area |
  |---|---|
  | 1 | 229 × 368 mm |
  | 2 | 178 × 267 mm |
  | 3 | 114 × 178 mm |
  | 4 | 64 × 92 mm |

- The archer shoots until a hit, up to 3 arrows:

  | Arrow | Kill | Wound |
  |---|---|---|
  | 1st | 20 | 18 |
  | 2nd | 16 | 14 |
  | 3rd | 12 | 10 |

- 28 targets. Max **560**.

**3D**
- **3D Hunting Round (V.E):** 1 arrow per target. Kill **20**, vital **16**, wound **10**. 28 targets. Max **560**.
- **3D Standard Round (V.F):** 2 arrows per target, both count. Kill **10**, vital **8**, wound **5**. Max **560**.

**Indoor Round (V.J)**
- 2 units × 6 ends × 5 arrows at 20 yd (18.3 m). Max **300**.
- 40 cm dull blue face (Pantone 282C) with an **8 cm bullseye and a 4 cm X**. White lines. Scoring is 5…1 from the spot out. X is for tie-breaks only.
- The same geometry as the NFAA indoor face. The optional 5-spot face is identical to NFAA's: white 8 cm = 5, blue 16 cm = 4.

**Flint Indoor (V.I):** 7 ends × 4 arrows per unit on 20 and 35 cm field faces, at 20 ft – 30 yd. Field scoring applies.

### 2.10 IBO and ASA (North American 3D)

**IBO 3D** **[IBO-2027 II.B, IV]**
- **11:** a circle centred in the 10 ring, **about 25 % of the 10 ring's size**.
- **10:** a circle inside the vital area.
- **8:** the vital area.
- **5:** the rest of the body.
- **0:** a miss, or a horn hit that doesn't touch body colour.
- A shaft touching the line of a higher zone scores the higher value.
- Distances are unmarked, with a maximum per stake from 20 yd (pink) to 50 yd (blue).
- Arrows per target and course size are not stated in the extracted text. Common practice is 1 arrow per target over 20 or 30 targets per round (secondary).

**IBO Field** **[IBO-Field]**
- Each target has **three 16 in foam cores**, each with one white scoring circle:

  | Core | Circle diameter | Value inside | Value outside (black) |
  |---|---|---|---|
  | 1 | 1.75 in | 13 | 5 |
  | 2 | 5 in | 10 | 5 |
  | 3 | 10 in | 8 | 5 |

- Round: 20 targets × 2 arrows. Max **520**. Ties go on 13s. Range-finders are allowed.

**ASA 3D** **[ASA-score]**
- The scoring page confirms only the rules about called rings. The top 12 ring counts **only when called**; once it is called, the bottom 12 scores 10. The **14 ring** is used only in special events.
- The full value set **14 / 12 / 10 / 8 / 5 / 0** comes from secondary sources and ASA's scoring-ring diagram, which could not be read as text.
- **App need:** a "called" flag per arrow.

**Europe 3D:** WA 3D (§2.4) and IFAA 3D (§2.9) are the main formats.

### 2.11 Other national and traditional systems (brief)

- **Archery Australia** **[AU-AA]:**
  - Indoor rounds are WA faces at 18 and 25 m.
  - The AA National Field face scores **5, 4, 3, 2, 1 with edges 0.2 … 1.0**, with 20 / 40 / 60 / 80 cm faces at 5–60 m.
  - Codified only; check against the Archery Australia rulebook.
- **Germany (DSB):** target archery uses WA faces. The German IFAA member (DFBV) publishes its own field faces on the IFAA site **[IFAA-home]**. No DSB-specific face geometry was verified.
- **Slovakia (SLZ):** assumed, not verified, to follow WA rules for target, field and 3D.
- **Scandinavia:** WA and IFAA formats plus national hunting and 3D variants. Sweden publishes mounted-archery rules **[SBF-hast]**. Nothing face-specific was verified.
- **Kyudo (Japan, ANKF):**
  - Kinteki: a **36 cm** target at **28 m**, scored **hit or miss** (kasumi-mato or hoshi-mato).
  - Enteki: 60 m, with a points face. Its size and values (often given as 1 m, scored 10/9/7/5/3) **could not be verified**; secondary sources conflict.
  - Sources: **[Kyudo-wiki]**, secondary; the rules themselves are in the ANKF Kyogi rules **[ANKF-kyogi]**.
- **Horseback archery (Hungarian/Kassai style):**
  - A 90 cm face with 30 cm pitch circles scoring 4-3-2 (inside out), plus a time bonus, on a 90 m track.
  - Rulebooks differ: IHAA, WFEA and national bodies use other value sets (5…1, 6-4-2) **[IHAA] [WFEA]** (secondary).
  - Out of scope for the app.

---

## 3. Mapping to the app

### 3.1 What fits the current model as-is

Today a face is `{x, perRadius}` with the values 10…(10 − perRadius + 1) and colours taken from the value.

- **These already fit:**
  - WA 122 / 80 / 60 / 40 cm full faces.
  - The 40 cm single spot, triple and Vegas sheets, and the 60 / 80 cm reduced faces.
  - The **WA 80 cm 6-ring face (10…5)**, which needs `perRadius: 6` on the reduced face. The app's `80s` is currently 10…6 (5 rings).
- **These fit by adding data only (sheet centres):**
  - 60 cm triangular and vertical triple faces;
  - the 40 cm vertical double face.
- **Archery GB metric and indoor rounds** (Portsmouth, Bray, Stafford, Frostbite, Vegas) and the **WA para and VI rounds** fit once distances are added (§3.3).

### 3.2 What needs a generalised zone table

Each of these is concentric, but the rings are not of equal width, the values are not sequential, or the values depend on the division.

| Face / scheme | Zones as `edge → value` (radius fraction) | Why `ringRule` can't express it |
|---|---|---|
| WA compound indoor (40 / 60 cm, -C) | full face: 0.05→10, 0.2→9, 0.3→8 … 1.0→1; spot: 0.1→10, 0.4→9, 0.6→8, 0.8→7, 1.0→6 | Values shift by division; X ring = 10, the outer 10 ring and the 9 ring = 9 |
| WA field 20 / 40 / 60 / 80 | 0.1→6, 0.2→5, 0.4→4, 0.6→3, 0.8→2, 1.0→1 | Ring widths differ; no X; tie on 6s and 5s |
| NFAA / IFAA field and hunter | X 0.1 (tie or +1), 0.2→5, 0.6→4, 1.0→3 | Ring widths differ; colours differ by face (field and hunter) |
| IFAA expert / NFAA expert | X 0.1, 0.2→5, 0.4→4, 0.6→3, 0.8→2, 1.0→1 | Values 5…1, black and white colours |
| NFAA / IFAA indoor blue 40 cm | X 0.1, 0.2→5, 0.4→4, 0.6→3, 0.8→2, 1.0→1 | Same geometry as the app's spot face, but values 5…1 and blue/white colours |
| NFAA / IFAA 5-spot | X 0.25, 0.5→5, 1.0→4 (per spot); 5 spots per sheet | Values and spot layout |
| Archery GB imperial 5-zone | 0.2→9, 0.4→7, 0.6→5, 0.8→3, 1.0→1 (no X) | Values step by 2 |
| Worcester | 0.2→5, 0.4→4, 0.6→3, 0.8→2, 1.0→1 | Values 5…1, white and black |
| Lancaster | 0.05→11 (X), then the WA 40 cm triple values 10…6 | X has its own value |
| IBO field cores | for example 0.109→13, 1.0→5 (1.75 in of 16 in) | Each core is a different face |
| WA clout | 0.2→5 … 1.0→1 over 15 m | Values 5…1; the scale is 15 m on the ground |

### 3.3 What needs non-concentric, 3D, or order-dependent handling

- **3D targets** (WA 11/10/8/5, IBO 11/10/8/5, ASA 14/12/10/8/5, IFAA kill/vital/wound): the zones are body-shaped and their sizes vary.
  - Recommended: **keypad-only scoring**.
  - Optionally, a schematic "vital oval + concentric 10/11" plot to record where arrows hit. Positions on a 3D target are approximate anyway.
- **Arrow-order scoring** (IFAA/NFAA animal rounds, WA Forest round): each target allows up to 3 arrows, the value depends on which arrow hit first, and shooting stops after the first hit. This needs an `attempt`-indexed value table and a "stop after hit" rule. It is a different end model, not just a different face.
- **Called zones** (ASA upper 12 and 14, Lancaster 12): a per-arrow "called" flag that changes the value of another zone.
- **Hit/miss** (ski, run, kyudo kinteki): one zone, value 1. Results are counted, not added up.
- **Flight:** distance logging only.

### 3.4 Suggested data-model changes

1. **Define faces as data**, the same idea as archeryutils' `FaceSpec` **[AU-targets]**:
   ```js
   // geometry: zone edges as fractions of the face radius, innermost first
   { id: 'wa-field-40', label: 'WA field 40 cm', diameterCm: 40,
     zones: [ { edge: 0.1, value: 6, colour: 'yellow' },
              { edge: 0.2, value: 5, colour: 'yellow' },
              { edge: 0.4, value: 4, colour: 'teal' },
              { edge: 0.6, value: 3, colour: 'teal' },
              { edge: 0.8, value: 2, colour: 'teal' },
              { edge: 1.0, value: 1, colour: 'teal' } ],
     tieBreak: [6, 5], spots: [[0, 0]] }
   ```
   - The X stays a zone with `{ edge: 0.05, value: 10, label: 'X' }` (or `value: 11` for Lancaster).
   - `scoreFromPoint` becomes "first zone whose edge is ≥ d", otherwise M.
   - `keypadValues`, `zoneOf` (colour) and `ringEdges` all derive from `zones`. The existing faces become 9 data entries.
2. **Keep the scoring scheme separate from the printed face.** The same printed 40 cm triple is scored differently for recurve and for compound. Model it as `face` (geometry and colours) plus `scoring` (values per ring index, X label, tie-break order). Pick the scoring from the session's bow type. archeryutils does the same with `10_zone` and `10_zone_compound` on one diameter.
3. **Make the line rule explicit.** Every source here gives the higher value when the shaft touches a line **[WA-B3 12.2] [WA-B4 22.2] [NFAA-VI] [IBO-2027]**. The archer taps the arrow's centre, so to follow the rule, subtract the arrow radius (as a fraction of the face radius) from `d` before the zone lookup. archeryutils' expected-score model also uses arrow radius (5.5 mm outdoors, 9.3 mm indoors in the AGB scheme) **[AU-agb]**. The arrow radius could come from the session's equipment setup.
4. **Define rounds as data:**
   ```js
   { id: 'agb-york', body: 'AGB', name: 'York',
     passes: [ { arrows: 72, distance: 100, unit: 'yd', face: '122', scoring: 'agb-5zone', arrowsPerEnd: 6 }, … ] }
   ```
   - Max score = sum over passes of arrows × max zone value. Field and 3D rounds are lists of targets with their own face and distance, plus a `marked` flag.
   - This replaces the free-text `ROUNDS` chips in `sessionTypes.js` and allows "round complete", progress and max-score displays.
5. **Store distances with a unit and allow any value.** Add 40 m and 90 m now. Yards are needed for AGB, NFAA and IFAA. Field and 3D need free metre values, and unmarked targets need an "unknown" or estimated distance.
6. **Add handicap later as a payoff.** Once faces carry ring diameters and rounds carry passes, the AGB 2023 handicap can be computed in the browser from the published model (Atkinson scheme: datum 6.0, step 3.5 %, ang₀ 5e-4, kd 0.00365) **[AU-agb]**. This gives a cross-round "level" across different distances and faces.

### 3.5 Priorities for a Slovak recurve / compound / barebow archer

| Priority | Item | Why |
|---|---|---|
| **P1** | Compound inner-10 scoring on 40 / 60 cm (WA -C faces) and short-distance tie-break counts (10s / 9s) | Current WA rule; today's indoor compound scores are inflated |
| **P1** | Faces as data (§3.4 items 1–3), with the current faces migrated unchanged | Prerequisite for everything else; small and testable (`scoring.js` is pure and unit-tested) |
| **P1** | WA round catalogue as data: 720s (70 / 60 / 50 m, barebow 50 m 122 cm, U15 40 m / 30 m), 18 m, 25 m, Combined, 1440, 900, Standard, 50 m Match; add 40 m and 90 m; 80 cm 6-ring; 60 cm triple; 40 cm double | Covers every WA target round a Slovak archer shoots |
| **P2** | WA field: 20 / 40 / 60 / 80 cm faces (unequal rings, 6-1), a 24-target × 3-arrow round with face and distance per target, marked/unmarked units, peg colour by division | Field is common in Central Europe and especially popular with barebow archers |
| **P2** | WA 3D: 11/10/8/5 keypad, 24 targets × 2 arrows, unmarked distances | Common for barebow, traditional and compound |
| **P3** | IFAA field, hunter, expert, indoor, 3D and animal (needs arrow-order scoring) | Only if the archer enters IFAA events (Hungary, Austria, Germany) |
| **P3** | Clout; Forest round (arrow-order scoring) | Occasional club events |
| **P4** | Archery GB imperial, NFAA, Lancaster, IBO, ASA, Kyudo, horseback | Not used in Slovakia; the face-as-data model makes them cheap to add later |
| **Later** | AGB 2023 handicap | Useful progress metric across rounds once faces and rounds are data |

---

## 4. Sources

**World Archery (primary, Rulebook version 2026-01-27)**
- **[WA-B2]** Book 2 – Events: 4.3 divisions, 4.5.1 target rounds, 4.5.2 field and 3D rounds, 7.2.2 target faces, 8.2.1 field faces, 8.2.2 3D targets. https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-01-27/EN-Book_2_-_2026-01-27_Version.pdf
- **[WA-B3]** Book 3 – Target Archery: 12.2 scoring, 12.4 scorecards, 12.5 ties. https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-01-27/EN-Book_3_-_2026-01-27_Version.pdf
- **[WA-B4]** Book 4 – Field and 3D: 22.2 scoring, 22.3 ties. https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-01-27/EN-Book_4_-_2026-01-27_Version.pdf
- **[WA-B5]** Book 5 – Para Archery: 28.3–28.4, round tables, 34.4.2. https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-01-27/EN-Book_5_-_2026-01-27_Version.pdf
- **[WA-B6]** Book 6 – Miscellaneous Rounds, Run and Ski Archery: 48.1 rounds, 48.2 Forest and Arrowhead, 48.3 Clout, 48.4 Flight, Ch.49 Run (49.2.1.7), Ch.50 Ski (50.16.2.1). https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-01-27/EN-Book_6_-_2026-01-27_Version.pdf

**Archery GB**
- **[AGB-RoS]** Archery GB Rules of Shooting (primary; HTTP 403 to automated fetch, **not read**). https://archerygb.org/files/rules-of-shooting-070125093540.pdf
- **[AU-AGB]** archeryutils round data (codified): `AGB_outdoor_imperial.json`, `AGB_indoor.json`, `AGB_VI.json`, `Miscellaneous.json`. https://github.com/jatkinson1000/archeryutils/tree/main/archeryutils/round_data_files
- **[AU-targets]** archeryutils `targets.py`, `gen_face_spec` (scoring systems as ring-diameter → value maps). https://github.com/jatkinson1000/archeryutils/blob/main/archeryutils/targets.py
- **[AU-hs]** archeryutils `handicap_scheme.py` (expected score from ring sizes; references Lane 2013 and Park 2014). https://github.com/jatkinson1000/archeryutils/blob/main/archeryutils/handicaps/handicap_scheme.py
- **[AU-agb]** archeryutils `handicap_scheme_agb.py` (AGB 2023 Atkinson and AGBold Lane scheme parameters). https://github.com/jatkinson1000/archeryutils/blob/main/archeryutils/handicaps/handicap_scheme_agb.py
- **[Lane-2013]** D. Lane, *The construction of the graduated handicap tables for target archery* (2013). https://www.jackatkinson.net/files/Handicap_Tables_2013.pdf

**NFAA, USA Archery and US events**
- **[NFAA-VI]** NFAA Constitution and By-Laws, Article VI Official NFAA Rounds (A Field, B Hunter, C Animal, D International, E Indoor, F Flint) (primary). https://nfaausa.com/about/constitution/official-nfaa-rounds
- **[NFAA-modern]** NFAA Modern Field / Hunter / Animal round rules (primary, not read in full). https://nfaausa.com/files/modern-field-hunter-animal-round-rules-pdf-180226152931.pdf
- **[NFAA-3D]** NFAA 3D (primary, not read in full). https://nfaausa.com/about/constitution/nfaa-3d
- **[NFAA-hc]** NFAA handicap (primary; via search summary). https://nfaausa.com/about/constitution/nfaa-handicap
- **[USAA-col]** USA Archery Collegiate Archery Program Event Reference Guidebook ("follow World Archery Rules"). https://www.usarchery.org/resource/collegiate-archery-program-reference-guidebook
- **[USAA-JOAD]** USA Archery JOAD format rules 2022. https://d2yehq1q0ukhbt.cloudfront.net/639024e00fff8-JOAD_format_rules_2022.pdf
- **[LAS-2022]** Lancaster Archery Supply, 2022 Lancaster Archery Classic press release (X = 11, 660, 1.5 cm 12 ring) (organiser, primary for that event). https://lancasterarchery.com/blogs/press-releases/2022-lancaster-archery-classic-release

**IFAA**
- **[IFAA-BoR]** IFAA Book of Rules 2021-2022 (rev. 04 Apr 2021), Article V Official Rounds A–J (primary). https://www.ifaa-archery.org/download/247/rules/6711/2021-book-of-rules.pdf
- **[IFAA-home]** IFAA document index (Book of Rules, Executive Clarifications 2026-06-01, ABA/DFBV/NFAA target face documents). https://www.ifaa-archery.org/documents/rule-book/book-of-rules/

**IBO and ASA**
- **[IBO-2027]** IBO 2027 Rules and Regulations: II.B scoring areas, IV scoring arrows, stake distances (primary). https://iboarchery.com/wp-content/uploads/2027-IBO-Rules-Final-Version.pdf
- **[IBO-Field]** IBO Field Archery Rules (primary). https://iboarchery.com/wp-content/uploads/2023-IBO-FIELD-Archery-Rules.pdf
- **[ASA-score]** ASA Archery scoring page (primary, partial: the ring diagram is an image). https://asaarchery.com/?p=1127

**Other (codified or secondary)**
- **[AU-AA]** archeryutils `AA_field.json` and `AA_indoor.json` (codified Archery Australia rounds). https://github.com/jatkinson1000/archeryutils/tree/main/archeryutils/round_data_files
- **[Kyudo-wiki]** Japanese Wiki Corpus, "Kinteki" and "Mato (kyudo)" (secondary). https://japanese-wiki-corpus.github.io/culture/Kinteki%20(the%20regular%20close-ranged%20shooting).html
- **[ANKF-kyogi]** ANKF Kyogi Rules (copy hosted by the Danish Kyudo association; not read). https://www.kyudo.dk/wordpress/wp-content/uploads/ANKF_Kyogi_Rules.pdf
- **[IHAA]** International Horse Archery Alliance rulebook pages (secondary, via search). https://ihaa.info/IHAA_Rulebook/files/basic-html/page70.html
- **[WFEA]** WFEA Competition Rules (secondary, via search). https://wfea.world/?p=574
- **[SBF-hast]** Svenska Bågskytteförbundet, mounted-archery event rules 2022. https://www.bagskytte.se/download/18.4f7760671855d71be7121703/1672441868066/2022-bagskytte-till-hast-grenregler.pdf

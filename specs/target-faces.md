# Circular paper target catalogue

Added 20 November 2026. Scope: circular faces only; animal silhouettes are deferred
at the user's request. These definitions support practice logging, manual target
placement, score entry and experimental camera detection. They do not constitute complete tournament-round
validation, target certification or automatic judging of line cutters.

## Reference rules

- World Archery Book 2, effective 15 August 2026, §8.2.1:
  https://extranet.worldarchery.sport/documents/index.php/Rules/Rule_Book_versions/2026-08-15/EN/EN-Book_2_-_2026-08-15_Version.pdf
- IFAA Book of Rules 2021–2022: Article V A/B/H/I/J, WIAC Flint variants and
  Annexure 03/1. Federation-hosted copy:
  https://www.fiarc.it/wp-content/uploads/2021/01/IFAA-Book-of-Rules-2021.pdf
- IFAA's rules page lists the 2021 book alongside the June 2026 clarifications:
  https://www.ifaa-archery.org/documents/rule-book/book-of-rules/

## Added families

| Family | Face sizes (cm) | Variants and practice layouts |
| --- | --- | --- |
| WA Field | 20, 40, 60, 80 | Yellow/black and yellow/teal. Single faces; 20 cm triple column; 40 cm four-face block; 60 cm double. |
| IFAA Field | 20, 35, 50, 65 | Black/white/black, single; 20 cm four-spot block. |
| IFAA Hunter | 20, 35, 50, 65 | White spot on black, single; 20 cm four-spot block. |
| IFAA Expert Field | 20, 35, 50, 65 | Subdivided field face, single; 20 cm four-spot block. |
| IFAA Indoor | 40; 16 per spot | Blue single and five-spot in dice arrangement. |
| IFAA Flint | 20, 35, 50; 21 reduced | Standard field faces, 20 cm four-spot and optional 21 cm four-centre sheet. |

A layout represents the faces visible on a practice sheet, not permission to
score another competitor's face. Spacing is illustrative and normalized; it is
not a certified printable face or a complete competition butt layout. WA field
20 cm competition butts contain four columns of three; select the archer's own
triple column. IFAA 20 cm competition butts can contain multiple four-spot blocks.

IFAA International uses the Hunter face. Flint reuses field geometry, but has its
own selectable family and reduced-centre variant. Full course sequences, target
rotation, walk-ups, per-target distances, arrow-order penalties and multi-hit
penalties are not automated. Enter the judged arrow values when these apply.

## Geometry and scoring profiles

Radii use the outer scoring radius as 1, independent of physical face size.

- WA Field boundaries: 0.1/0.2/0.4/0.6/0.8/1, worth 6/5/4/3/2/1; no X.
- IFAA Field/Hunter: 0.2/0.6/1, worth 5/4/3; no X score entry.
- IFAA Expert and Indoor single: 0.1/0.2/0.4/0.6/0.8/1, worth X/5/4/3/2/1.
  X is worth 5, not 10.
- Indoor five-spot: white 0.5, blue 1, worth 5/4; no X entry.
- Flint 21 cm centre: a 7 cm black centre and 21 cm white outside, worth 5/4.

New WA Field profiles include the inner zone at an exact boundary. IFAA profiles
use the outer zone at an exact boundary, following Annexure 03/1 (crossing the
line is required). These are point-placement conventions: the app has no arrow
shaft-diameter measurement and cannot determine a physical line cutter from a
finger tap. Use score keys to record an official judged value. Existing WA
Target point-boundary behaviour is preserved for compatibility.

Drawing palettes are screen approximations, not print colour specifications.

## Architecture for future additions

`public/js/app/targetCatalog.js` separates:

1. Family, identifier, physical size and display metadata.
2. Scoring zones, maximum, X value and boundary convention.
3. Colour bands, independent of numeric score.
4. Spot layout, independent of scoring.
5. Camera capability, independent of manual-scoring support.

`scoring.js` adapts these definitions alongside the existing WA Target faces.
Old IDs and sessions retain their behaviour. Family/size/layout selection uses
catalogue metadata, not a size-only assumption. Changing distance does not
silently replace a non-WA family with a default WA face. Custom metres and IFAA
yards inputs are available; distances remain stored and displayed in canonical
metres (one yard = 0.9144 m), avoiding a mixed-unit storage migration.

Face context is propagated through numeric X conversion, end sums, History,
statistics, grade insights and session comparisons. Score entry and spot indices
are validated against the selected face. Five-spot sessions can persist spots
0–4 and survive save/reload and backup export/import.

The stored document shape is unchanged, so existing backups remain readable.
Older application versions do not know the new face IDs and may reject backups
containing them. Keep backups private, and use the updated testing build for
new-family data. There is no automatic conversion of existing sessions.

## Camera detection

All registered circular faces support single-view, photo/gallery and multi-view
scanning. New catalogue faces have `camera: 'experimental'`; unknown IDs are
still rejected before pixel analysis. The existing WA Target gold/red anchor
path is retained, with template-based ordering also covering 60 cm and compound
multi-spot faces.

`targetDetect.js` supplies palette-aware pixel classification and anchor
validation. Gold or white centres provide a disc; black/white/black faces use the
larger white annulus; the reduced Flint centre uses its black disc. Annulus
moments are corrected before mapping pixels into the selected face's coordinates.
Border-connected background components are excluded. Nearby anchor parts split
by scoring lines can merge, but differently sized concentric white lines cannot.

Every candidate must match the selected face's colour bands at several radii
and angles. Dark scoring faces must also end at their predicted outside edge,
which helps reject a small disc fitted using the wrong face profile. Printed
score-line pixels are excluded from new-family arrow masks. Navy/teal brightness
histograms allow the shaft path to compare pixels against those rings rather
than the legacy palette. Ordered two-, three-, four- and five-spot results feed
both existing capture modes and the same editable preview.

Select the correct family/layout before scanning. Keep all relevant spots in
view, upright, at a shallow angle and in good light. The pattern checks can
reject truncated/obscured faces or anchors under heavy arrow damage. In a partial
view the single-view mode uses the selected spot hint; multi-view still requires
the complete sheet. A dark shaft against black ink can be visually indistinguishable;
fletchings/holes may only provide an approximate impact point. Ring lines, glare,
poor lighting, camera roll and neighbouring targets can still cause errors.
There is no calibrated perspective reconstruction or automatic shaft-diameter
line-cut correction. Always review and correct the preview before Use.

This is generated-image and integration coverage, not measured accuracy on real
IFAA/WA Field photographs. Real-target Android validation and a labelled photo
set are still required before claiming production detection accuracy.

## Validation

Tests cover every added definition's geometry and palette, boundary semantics,
family/size/layout selection, yard conversion, five-point X totals and maxima,
History summaries, five-spot persistence and backup import, invalid scores and
spots, camera capability checks and existing WA regressions. Detection tests cover every
registered face, clean faces, printed score lines, tilt, moderate dimming, shafts,
four-arrow single faces, partial-view hints, wrong profiles and blank backgrounds.
Real detector outputs also exercise steady and multi-view capture on multi-spot
new-family faces. Browser QA checks the selector
and rendered faces at phone width. Real paper-target and camera validation remain
separate from generated-image and UI checks.

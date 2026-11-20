# PWA and camera-testing deployment fixes

Date: 20 November 2026

These changes prepare safe Android camera testing in the
`inglubosfiala/ArcheryPerformanceJournal` fork. They do not change the arrow
recognition algorithm or establish a new detection-accuracy baseline.

## Problems addressed

| Problem | Fix |
| --- | --- |
| Different commits could share a cache version derived from commit count. | Cache names include version, commit and build time. |
| Cache Storage is shared by applications on the same origin. | Cache names include environment and registration scope; reads use only the current cache and cleanup only removes older caches in that namespace. |
| Seven application modules were absent from the offline shell. | Added all seven; a regression test checks all shipped JavaScript and the existence of every precached asset. |
| Offline development requests could receive HTML in place of missing JavaScript. | HTML fallback is restricted to navigation requests. |
| Theme bootstrap assumed test deployments always lived under `/test/`. | Deployment stamps the environment into the bootstrap script, supporting testing at the project root. |
| The inherited deployment would serve `main` at the fork's root URL. | It is disabled specifically in this fork; a separate workflow serves `camera-test` at the root. |
| Deployment could publish a branch tip that had not been validated, and manual runs bypassed CI. | The fork workflow checks out and validates one exact revision before packaging it. The inherited workflow validates both checked-out revisions before packaging. |
| Reusing upstream Drive configuration could expose production sync data to tests. | The fork artifact disables OAuth, uses a fork-specific journal key and Drive filename, and installs with Camera TEST branding. |
| Documentation contained a missing handoff link and outdated claims about sync. | README and architecture documentation now describe current behavior and fork setup. |

## Deployment behavior

The new `.github/workflows/deploy-camera-test.yml` runs only for this fork and
`refs/heads/camera-test`. Both pushes and manual runs execute dependency
installation, lint and tests before uploading the static site. The source
configuration stays unchanged; environment, storage, sync and manifest changes
are applied to the deployment copy.

The intended URL is:
https://inglubosfiala.github.io/ArcheryPerformanceJournal/

Before publishing, enable Actions in the fork, select GitHub Actions as the
Pages source, and allow `camera-test` in the `github-pages` environment's branch
rules. The branch and these settings are not created by this change. Publishing
requires a separate push or manual deployment from that branch.

Only the fork's deployment configuration is selected by the repository guard.
The upstream repository's hosting and data are not modified by this local work.
The inherited upstream workflow retains its dual-environment layout, with
additional validation before publishing.

Legacy caches are deliberately retained: old names do not identify their
registration scope safely. Do not clear all site data as an update procedure;
that also deletes journal data. Export a backup before intentional data removal.

## Validation

Completed locally:

- All seven dependency-free PWA regression tests passed using
  `node scripts/test-pwa.mjs`.
- Parsed all workflow YAML files.
- Executed the fork's assembly step in a temporary directory and verified
  environment stamping, isolated storage, disabled OAuth, test manifest and
  generated JavaScript syntax.
- Checked service-worker and theme-bootstrap JavaScript syntax.
- Checked the diff for whitespace errors.

The PWA regression tests are included in `npm test`, ahead of Vitest.
Full ESLint and Vitest checks could not run in the available shell because npm
is unavailable. No Android hardware checks or live GitHub Actions deployment
were performed. The deployment workflow requires lint and tests to pass on its
runner before publishing.

## Android follow-up

On HTTPS Pages or USB-forwarded localhost, verify camera permission, rear-camera
selection, detection accuracy and latency, manual corrections, offline cold
launch and updating an already installed PWA. Compare algorithm changes against
a fresh real-photo baseline; historical reports are not results for this change.

## Faster live-camera lock (20 November 2026)

Following phone feedback that the steady hold took too long, automatic capture
now requires three agreeing readings spanning at least 600 ms, instead of five
spanning at least 1000 ms. This is a minimum observation period, not a promised
capture time: processing speed and inconsistent detections can take longer.
Position tolerance, photo detection, score calculation and the incomplete-sheet
restriction are unchanged. Fewer samples can make auto-capture less conservative;
check the preview and correct detected arrows before using the result.

A current frame must also agree with the consensus before automatic capture.
An older majority can still be displayed through a transient bad frame, but
cannot trigger capture on that conflicting frame. Take now remains available.

Validation: lint passed; all 637 Vitest tests across 38 files and all seven PWA
tests passed using an isolated Node 22 runtime. Added regressions for conflicting
current frames and slow-device sampling, and updated the timing tests. Android
capture timing and false-lock frequency still require device testing.

## Separate experimental multi-view scan (20 November 2026)

Added a second scan button above the original four-action row, leaving the
original Scan button, steady lock, Photo and Gallery path intact. Multi-view
samples changing observations at least 350 ms apart, matches arrows by spot and
position, and combines their normalized coordinates with a median. At least
three observations are needed to review; five open the preview automatically.
Repeated appearance signatures, incomplete sheets, missing arrows, non-finite
positions and ambiguous matches are rejected. The user can reset or cancel.

The fused coordinates are projected onto the last accepted frame for the normal
editable preview. Later rejected frames do not replace its saved reference
image. Frames pending when Reset is pressed are discarded. Camera tracks and
workers are stopped when the dialog closes. The offline shell includes the new
module; existing storage and sync configuration is unchanged.

This is an experimental 2D fusion baseline using the existing ellipse mapping,
not calibrated camera poses, homography reconstruction or shaft triangulation.
Its appearance-diversity check does not prove physically distinct viewpoints.
All arrows for the end must be visible; uncertain or overlapping arrows may
require resetting or using the original Scan. Only one reference image is saved
if scan-photo saving is enabled, not the full sweep.

Validation: lint, 651 Vitest tests across 40 files and seven PWA tests passed.
New tests cover observation count and spacing, duplicate rejection, coordinate
fusion, reordered/ambiguous matches, target loss, reset, original camera controls
and steady lock, manual review, automatic review and camera cleanup. The scoring
screen was checked in a 360 × 800 browser viewport, including its 56 px multi-view
button. Android viewpoint diversity, accuracy and capture latency still need
real bow-and-target testing.

## Extensible circular target families (20 November 2026)

Added WA Field black/teal and IFAA Field, Hunter, Expert, Indoor single/five-spot
and Flint circular faces, including reduced Flint centres and relevant practice
layouts. Added a family selector and correct target drawings and keypad colours.
Physical size, scoring profile, palette, layout and camera capability now have
separate catalogue definitions for future additions.

Totals, maxima, X values, History end editing, score buckets, grade insights and
comparisons now receive face context. IFAA X is worth five. Validators support
five spots and reject out-of-profile scores. Existing WA IDs, point-boundary
behaviour and scan modes are retained. Distance edits preserve the selected
non-WA family; IFAA yards entry converts to canonical metres. The new module is
in the offline shell.

New-family camera buttons are explicitly disabled and the detector itself rejects
unsupported faces. No incompatible gold/red camera recognition is presented as
working. Animal silhouettes are excluded at the user's request; course sequences,
walk-ups and competition penalties are not automated. The existing document
shape is unchanged; older builds cannot necessarily import new face IDs.

Rules, geometry, limitations and the extension approach are documented in
`specs/target-faces.md`. Regression coverage includes setup, drawings, keypads,
face-specific totals, comparisons, repository persistence and backup round-trip.

Validation for this change: lint passed; 665 Vitest tests across 42 files and
seven PWA tests passed. Added 14 catalogue/integration tests and updated the
all-face boundary regression to respect each profile. Setup and five-spot target
rendering were checked at 360 × 800. New camera detection was not claimed or tested.

## Camera detection for all circular targets (20 November 2026)

Supersedes the new-family camera restriction in the previous change. All
registered faces now enable both scan buttons; new-family detection is explicitly
labelled experimental. Added palette-based disc/annulus anchors, ring-pattern and
outer-boundary validation, printed-line suppression, and navy/teal shaft contrast
histograms. WA Target retains its existing anchor path. Spot ordering now follows
layout geometry for 60 cm/compound triples, Vegas, double, four- and five-spot faces.

Repeated scoring lines cannot be merged into an incorrectly sized white centre.
Pattern checks also reject a single indoor face mistaken for a five-spot centre.
The new module is precached and uses the existing worker, photo, editable preview
and multi-view paths. No images leave the device and no additional runtime
libraries are loaded.

Generated-image regressions exercise every registered face, printed lines, clean
faces, modest tilt/dimming, side-on shafts, multiple arrows, partial spot hints,
wrong profiles and blank images. Detector results are passed through both steady
and multi-view readers. UI tests now require both scan buttons enabled. Real
IFAA/WA Field accuracy and Android latency have not yet been measured: user
review remains essential, especially on black rings and near score lines.

Validation: lint, all 748 Vitest tests across 43 files and all seven PWA tests
passed. The added generated-image suite has 83 cases covering all 56 registered
face IDs, plus the negative and capture-integration cases described above.
These results are not a real-photo accuracy benchmark.

## Sight-mark distances in yards (20 November 2026)

The setup's sight-mark page now offers Metres / Yards for adding distances,
remembers that choice per setup, and provides yard presets (20, 30, 40, 50, 60,
80 and 100 yd). Other accepts decimal distances up to 150 in the selected unit.
Existing marks retain their original labels; a setup can contain both units.

Distance parsing, ordering, nearest-elevation suggestions, duplicate detection
and session lookup compare physical distances using 1 yd = 0.9144 m. A 20 yd
mark therefore matches an 18.288 m session, rather than a 20 m session. Session
lookup tolerates conversion rounding, and the setup summary shows the recorded
unit. Legacy unlabelled distances remain metres. The stored sight-row format and
existing session snapshots are unchanged.

Regression tests cover mixed-unit lookup and sorting, legacy distances, decimal
entry, invalid input, remembered unit selection and unchanged existing marks.

Validation: lint, 751 Vitest tests across 44 files and all seven PWA checks
passed. The focused sight-mark tests also passed after final input validation.

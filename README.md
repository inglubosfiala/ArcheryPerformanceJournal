# Archery Performance Journal

A phone-first PWA for an Olympic recurve archer. It logs training arrow by arrow and grades every shot on process — **mental program (M)** and **shooting cycle (S)** — following the *With Winning in Mind* approach: measure process quality, not only score.

- **Platform:** [ARCHITECTURE.md](ARCHITECTURE.md) — static files, no backend, data only on the device, offline, installable.
- **Features and terminology:** [CONTEXT.md](CONTEXT.md), with feature-specific specifications in `specs/`.

## Run locally

```bash
npm install
npm start          # serves ./public on http://localhost:8080
npm test           # Vitest: scoring, statistics, session flow, repository, backup
npm run lint
```

To test on an Android phone: connect over USB, open `chrome://inspect` on the PC, enable **Port forwarding** `8080 → localhost:8080`, then open `http://localhost:8080` on the phone.

## What's in the app

| Tab | Purpose |
|---|---|
| **Log** | New session (distance, face, arrows/end with smart defaults) → arrow-by-arrow logging. Touch the target face (a magnifier shows the exact spot; release to score) or tap a quick key (X 10 9 8 7 6 M), then tap the M and S grade rows under the target (3 taps per arrow). Tap an arrow to select it, then touch the target or a key to re-score it and tap grades to regrade it; tap it again to deselect. Let-downs / correct let-downs and a note per end. The active session is saved on every tap and resumes after a reload. |
| **Dashboard** | Opens the new-session setup (distance, face, arrows/end), also while a session is in progress (Continue, or start a new one — the running session is then finished or, with no saved ends, discarded). |
| **History** | Training log list → session detail: Total, Avg arrow, 10s (X), Avg M, Avg S, M1–2 %, *avg arrow by mental grade*, and the ends table (`Date · End · Arrows · EndScore · Grade M · Grade S · Let-downs · Correct LD · Note`). |
| **Gear** | Gear setups: bow, arrows, string, tuning, stabilisers & accessories, and the sight marks per distance. One setup is active and new sessions take a copy of it (marks included; the mark for the session's distance shows as a pill on the running session). Each value is edited in a sheet with −/+ in sensible steps (in / cm where it fits) and saved at once, with an optional reason kept in the field's tuning history. |
| **Grades** (header) | The M/S grading rubric. |
| **Settings** (header gear icon) | Accent colour, **backup export / import (merge or replace, with undo)**, storage diagnostics. |

## Environments

| Branch | URL | Notes |
|---|---|---|
| `main` | https://vladicek79.github.io/ArcheryPerformanceJournal/ | production |
| `main-test` | https://vladicek79.github.io/ArcheryPerformanceJournal/test/ | test build: **TEST** badge, separate data and Drive file |

Push to `main-test` to try a change on the phone before merging it into `main`. Every deploy republishes both from their branch tips.

## Camera testing in the inglubosfiala fork

The fork-only `Deploy camera test` workflow publishes `camera-test` at
https://inglubosfiala.github.io/ArcheryPerformanceJournal/ after lint and tests
pass on the exact deployed commit. It also validates manual runs, which must be
started on `camera-test`. The inherited dual-environment deploy is disabled in
this fork; the upstream repository retains its existing layout.

Before the first deployment, enable Actions in the fork, select **Settings →
Pages → Source: GitHub Actions**, and allow `camera-test` in the `github-pages`
environment's deployment branch rules. Creating the branch or changing these
settings is a separate setup step; adding the workflow alone does not deploy.

The deployed copy shows **TEST**, installs as **Archery Camera TEST**, uses
`apj-camera-test.v1` for journal data, and disables Google Drive sync. Source
configuration is not rewritten. Keep Drive disabled until a separate OAuth
client and fork-specific Drive file are configured. Browser storage on this
fork's origin is separate from the upstream site's storage.

Service-worker caches include the environment, registration scope, commit and
build time. Reads and cleanup are restricted to this worker's cache namespace.
Legacy caches from older releases are left untouched to avoid deleting caches
belonging to another app on the same origin. Export a backup before manually
clearing site data; that also removes the journal.

For Android checks, use HTTPS Pages or the USB localhost forwarding described
above. Verify rear-camera permission, scan accuracy, correction controls,
latency, offline cold launch, and updating from a previously installed build.
The historical reports under `Claude outputs/` are experiments, not a current
accuracy baseline: measure the real-photo set before changing detection.

## Paper target families

Session setup now includes a **Target family** selector for existing WA Target,
WA Field (black/teal), IFAA Field, Hunter, Expert, Indoor and Flint. Pick a size
and layout within that family. Indoor supports the 40 cm single and 16 cm
five-spot; the other families include their relevant multi-spot variants.
IFAA X scores count as five; totals, History and backups preserve that meaning.
IFAA setup accepts yards, converted to metres for storage and summaries.

The added families support manual target placement and score keys. Their camera
buttons are disabled until a suitable detector is implemented. Existing WA
Target camera modes remain available. Circular targets only; animal silhouettes
and full field-course/round enforcement are not included. See
[the target catalogue specification](specs/target-faces.md) for sizes, rules,
layout assumptions, line-cut limitations and extension points.

## Comparing camera scan modes

The scoring screen keeps the original **Scan** button (live steady lock, Photo
and Gallery) in its existing row. A separate **Multi-view scan · experimental**
button above it opens the sweep mode.

For multi-view, keep the target upright and move slowly sideways through a
shallow arc. Keep the whole sheet and all the end's arrows visible. The counter
collects up to five observations with changed shaft directions or target shape;
repeated views and incompatible arrow readings do not count. After three views,
tap **Review views**, or let the fifth view open the preview. **Reset sweep**
clears the collected readings. Closing cancels without applying detected arrows.
Both modes use the same draggable preview and require **Use** before replacing
the end's arrows; scanning a full end first opens the next end as before.

This first version combines median arrow coordinates using each frame's
existing target-ellipse mapping. It is **not 3D triangulation or full perspective
reconstruction**. View diversity is estimated from image appearance, not measured
camera angles. Large angles, camera roll, glare, overlapping shafts or incorrect
ring fits can still produce wrong results. Compare the two previews on the same
physical arrows before accepting either; improved accuracy is not yet measured.

Only the final accepted reference frame is offered for saving under Settings →
Scan. The other frames are processed in memory; the sweep does not save a photo
sequence or add images to the journal. The new module is precached for offline use.

## Google Drive sync (optional)

Settings → **Sync with Google Drive** keeps the journal in a hidden app-only folder of your own Google Drive and syncs it between devices (on start, after changes, after finishing a session, when back online, and on *Sync now*). It needs a one-time Google Cloud setup: [specs/google-drive-sync/google-setup.md](specs/google-drive-sync/google-setup.md). Until `GOOGLE_CLIENT_ID` is set in `public/js/config.js`, the card says sync is not set up.

## Code layout

```
public/                 deployed as-is (no build step)
  js/core/              router, in-memory UI state, DOM builder
  js/storage/           repository (single JSON document), localStorage adapter, migrations
  js/backup/            export (share sheet / download) and import parsing
  js/sync/              Google Drive sync: sign-in redirect, Drive client, merge, sync service, controller
  js/pwa/               service worker registration, update prompt, storage persistence
  js/app/               app code: collections + validators, scoring, stats, session logic, views
  sw.js                 cache-first app shell (network-first while unstamped in local dev)
tests/                  Vitest unit tests
scripts/make-icons.mjs  regenerates the PNG icons
.github/workflows/      CI (lint + tests) and GitHub Pages deploy (stamps __APP_VERSION__)
```

## Decisions where the two source documents differ

- **Stack:** HANDOFF suggests Vite + React + TS + Dexie; ARCHITECTURE prescribes vanilla ES modules with no build step. The platform document wins; the handoff marks its stack as a suggestion.
- **Storage:** HANDOFF asks for IndexedDB; ARCHITECTURE (D2) uses one `localStorage` document behind an adapter, with IndexedDB as the upgrade path. Data volume is small, so `localStorage` is used; swapping in an IndexedDB adapter does not change app code.
- **Fonts:** HANDOFF names Space Grotesk / Inter from Google Fonts; ARCHITECTURE forbids runtime CDNs. The font stack lists them first and falls back to system fonts. Bundle the font files into `public/` if the exact look is wanted.

## Backups

Backups are plain JSON with personal data. Keep them private and **never commit them** (`*-backup-*.json` is git-ignored).

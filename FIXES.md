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

# CI gates and published-viewer verification

The main-branch ruleset requires GitHub Actions (app15368) checks `test` and
`bounded-models`. Canonical Board requires `Python 3.10`, `Python 3.11`,
`Python 3.12`, `Python 3.13`, and `bounded-models`. Both require the branch to be
up to date and retain deletion/force-push protection with no bypass actors.
Use a branch and PR; wait for all required checks before merging. If a job is
renamed, update the required context deliberately or merges remain blocked.
Daily `freshness` is operational monitoring, not a per-PR requirement.

Normal suites have finite job/step limits. Network setup alone uses
`scripts/ci_retry.py`, with two bounded attempts and process-group cleanup on
timeout/interruption; tests are never retried by this helper. Python requests,
npm fetches, apt requests and browser downloads also have request limits.
Playwright's system libraries use official Ubuntu HTTPS mirrors with signature
verification retained; browser versions come from the exact npm lockfile.
Formal preparation uses two60-second setup attempts within its existing180-second
phase cap; model, trace and regression commands remain unchanged.
A setup outage is a failing check, never a pass or permission to skip tests.

## Release path

A stable tag starts `release.yml`: test the exact tag, prepare assets from that
exact tested commit, publish them, then call `verify-release.yml` explicitly.
Current setup tooling is checked out separately when testing historical tags;
the application and package builders still come from the exact tested tag.
The direct call is required because releases created with `GITHUB_TOKEN` do not
start another release-event workflow. See [GitHub trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow). External published release events also run
the verifier; **Verify published viewer → Run workflow → tag** supports backfill.
Package verification supports stable v2.11.4 and newer; earlier releases lack
this application/checksum contract and are refused explicitly.

The read-only verifier downloads all published assets and the release metadata,
checks out the immutable tag with its pinned canonical source, and rebuilds
expected payloads using that tag's builders. It requires the complete exact asset
inventory, source/tag/tested-commit identity, clean source and release consistency.
All release SHA256SUMS entries must match the complete downloads. Standalone bytes
and every decompressed ZIP file must match tagged source output; compression bytes
may differ across platforms. Duplicate, oversized, encrypted, symlink and unsafe
ZIP entries are refused. The embedded package manifest is compared byte for byte
with the tagged builder's expected inventory. Only then is the viewer extracted.

Chromium and Firefox open that downloaded viewer and query the deployed HTTPS
checker. Its successful stable version must match an independent latest-release
API response; an older backfilled release should still discover the current latest.
A concurrent newer release can cause an API/checker disagreement and a failed check;
inspect it and rerun against the current stable metadata. PR/main fixtures remain
deterministic and do not depend on the live public checker.

The Actions summary reports asset and live-browser outcomes separately. JSON
artifacts are retained30days; raw downloads and temporary workspaces are not
public repository documentation. A failed post-publication check fails CI but
never deletes, replaces or rolls back a published release automatically. Inspect
metadata, source identity, altered payloads and network availability before retrying.
A green artifact/source comparison proves integrity against the tag, not that the
release is defect-free or that the GitHub platform is independently available.

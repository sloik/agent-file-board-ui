# Board package releases and guided updates

Status: agreed architecture; runtime/package implementation pending.
SPEC-002-043 replaces the automatic-installation part of SPEC-002-042. The owner
chose a GitHub release ZIP plus manual update instructions and explicitly retained
the daily in-app update notice. No installed updater is required.

## User contract

1. Check daily while the viewer is open, including an overdue check on reopening.
   Show an update notice, current/latest versions and changes. Failed checks mean
   latest unknown; offline viewing and composing remain usable.
2. **Download update package** opens the fixed official GitHub release/package
   link. Installation is manual; the board neither overwrites files nor claims
   that starting a download completed installation or verified the saved ZIP.
3. Show a concise update guide with the download. The user finishes or explicitly
   discards unfinished work, backs up application files, extracts the new package,
   replaces only application files and reopens/reloads when ready.
4. The in-app Reload action remains explicit and checks unfinished work and active
   operations. Comprehensive draft recovery is outside initial scope. Browser/OS
   reload and close controls cannot be treated as an unconditional recovery guarantee.
5. One viewer installation may open any number of boards; per-project viewer copies
   are also supported. There is no required layout beside `.agent-board`.
6. Preserve Git checkouts: offer a standalone released package instead of editing
   tracked files or invoking Git. Apply the same preservation default to source
   ZIPs, customized installations and unknown source mode.
7. A user can manually replace application files in a shared/Dropbox installation.
   Normal sync may propagate them. Existing tabs keep their loaded version until
   reloaded; the board cannot confirm remote sync completion.

## Release package

Publish an additional app-only `agent-file-board-viewer.zip` from the exact tested
release checkout. This is distinct from `agent-file-board-demo.zip`, which contains
fictional boards. Do not advertise the demo ZIP as an in-place update package.

Candidate package layout:

```text
agent-file-board-viewer/
├── board.html
├── README.md
├── UPDATE.md
├── package-manifest.json
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── licenses/
└── scripts/
    ├── voice_helper.py
    ├── voice-helper.html
    ├── desktop_opener.applescript
    └── install_desktop_opener.py
```

The core viewer currently bundles its JavaScript, styles, schemas and upgrade
metadata. Optional helper tools ship as their required file sets; Python/models
or OS registration remain optional setup documented by each tool. Normal viewing
must not require Python or running an installer.

The package manifest records format version, viewer version, bundled canonical
version, and each managed relative path, role, byte count and SHA-256. It excludes
its own recursive checksum. Future required runtime assets must be included in
the package/inventory and packaging tests must verify that dependency closure.
Do not assume future releases remain HTML-only.

Never package real `.agent-board` data, conversations, identities, presence/read
state, private trust/key storage, user configuration, custom extensions, arbitrary
source checkout files or session validation reports. Board-format migrations remain
separate preview/consent operations. Updating bundled helper source does not restart
an already-running process or silently re-register an OS helper; explain explicit
restart/setup requirements and protocol compatibility.

The existing [release preparation](../../scripts/prepare_release.py) and
[publisher](../../scripts/publish_release.sh) stage/preserve tested assets. Extend
that pipeline for the app ZIP and matching notes/checksums; keep existing assets,
backfills and published releases unchanged. A checksum from the same GitHub channel
is integrity metadata, not independent publisher authentication. Do not use board
participant keys as executable-release trust.

## Manual update guide

The maintained `UPDATE.md` should cover these steps on macOS, Windows and Linux:

1. Read the target version's notes and finish or explicitly discard unfinished
   work. If using an optional helper, check whether its process needs restarting.
2. Download the app ZIP from the official release. Extract into a fresh staging
   folder, not directly over a project/data directory.
3. Keep the prior application package or back up its application files. For a
   stable shared installation, copy only managed application files from the new
   package into the application location; preserve unlisted user/data files.
4. If using a Git/source copy, open the extracted standalone viewer instead of
   changing source files. Do not move or delete existing board data. A new viewer
   location does not guarantee automatic migration of browser settings/private state.
5. Reopen/reload the intended viewer and check its displayed running version.
   Reopen the board if permissions require it; uploaded snapshots need reselection.
   Signing starts locked and requires explicit unlock; never persist private keys
   to make updates convenient.
6. If the new viewer fails, restore the prior application files at their original
   location. Declare storage/rollback compatibility: old HTML cannot undo a newer
   IndexedDB migration, and restoring code must never reset signing trust/floors.

Use clear platform file-manager instructions. Avoid a blanket replace/delete of
an entire project folder. Optional checksum-verification commands can be documented
without making terminal use necessary for ordinary installation.

## Daily notice without widening worker network access

Keep the viewer's parent `connect-src 'none'` and existing `data:` component workers
unchanged. Direct parent GitHub fetching would widen the CSP inherited by those
workers, so a simple host allowlist would not preserve current isolation.

Deploy one small fixed **cross-origin HTTPS checker page** on publisher-controlled
GitHub Pages. Unlike `srcdoc`/`data:` documents, an independently fetched HTTP(S)
page uses its own CSP. Parent `frame-src` permits only that checker endpoint.
The iframe has `sandbox="allow-scripts allow-same-origin"` and
`referrerpolicy="no-referrer"`, without popup/navigation/download/form permissions.
Require checker origin to differ from the viewer origin; a same-origin hosted
viewer must use a separately qualified opaque/separate-origin variant or fail
closed to manual checking. Never make same-origin sandbox escape a trusted shortcut.

The checker has a restrictive CSP: hash-authorized script, only the fixed public
GitHub release-metadata API, no frames/workers/images/forms. Fetch live stable
release metadata with omitted credentials, bounded response/time and explicit
cache policy. Do not depend on redeploying a baked-in latest version after every
release. Older releases without an app ZIP link to their release page truthfully.

No board contents, selected paths, participant IDs, file handles, private trust or
keys are passed to the checker. A response contains only a protocol version,
validated stable release version/ID/time and package availability. Parent accepts
one bounded response only from the exact iframe window, expected HTTPS origin
and unpredictable request channel; render values as text. Ignore forged, stale,
extra or malformed messages. Dispose the iframe/listeners on completion or timeout.

The parent builds release/package links from fixed repository constants; it never
accepts arbitrary download URLs, HTML or executable code in checker messages.
The iframe does not read or install package bytes. A downloaded ZIP's validation
is the release pipeline's job, with public integrity information available for
manual verification; the UI does not claim to inspect the saved download.

Store schedule, last success and optional skipped-version state locally, independent
of board data. Use bounded coordination where local storage permits; if scheduling
state cannot be persisted, fall back to manual checking instead of request storms.
Display latest unknown on failure and preserve the last-success time. Loading a
publisher checker is an explicit change to the old no-automatic-network contract;
update runtime documentation. GitHub Pages receives a connection/IP, but no board
data or referrer is required.

GitHub Pages configuration and endpoint deployment are required new work. No live
checker exists or is claimed by this design. A bounded file-origin Chromium
prototype with an independently served HTTP checker retrieved metadata while
parent/worker `connect-src 'none'` remained enforced: the worker's attempted request
did not reach the server. This establishes the architectural distinction, not
production HTTPS deployment, Firefox support or complete message-protocol testing.

## UI states and implementation scope

| State | Behavior |
| --- | --- |
| Checking | Nonmodal; writing remains available |
| Current | Display successful-check time and current/latest version |
| Update available | Changes, Download package and Update guide; no Install action |
| Offline/check failed | Latest unknown; keep working; retry or open official release page |
| Download requested | Open fixed official package/release URL; no claim that files were replaced |
| Reload requested with unfinished work | List categories and return to work or scoped explicit discard |
| Reopened | Display actual running version; no assumptions about other tabs/computers |

Reload guard categories include composer text/routing/reply/structured attachments,
modified choices/forms/extension replies, voice capture or uninserted transcript,
authoring/builder changes, pending/failed storage, and active signing/publication,
package installation, board migration or other writes. Recheck immediately before
the in-app reload. Initialized default forms must not count as dirty merely because
a Map contains them. Discard cannot cancel an already committed publication.

Implement in bounded parts:

1. App-only deterministic ZIP builder, inventory, useful update guide and exact
   tested-release integration. No fictional/demo or user/private data.
2. Static checker deployment and bounded parent adapter, daily scheduling, notice,
   package/release link and errors. Keep main/worker network denial intact.
3. Update help and guarded explicit reload, with existing source/standalone behavior
   explained. No file registration, write grants, automatic replacement, installer
   transaction log or local updater application.

## Verification

Package tests should build reproducibly, verify exact tagged inputs, every inventory
size/hash, required dependency closure, licenses/tools, no forbidden data/source
paths and safe archive paths. Extract the real package and exercise its start/help
paths. Verify new asset publication and preserve old release assets/backfills.

Browser tests must cover actual file→HTTPS checker behavior in Chromium and Firefox;
wrong source/origin/channel, malformed/oversized/late messages; timeout/offline/API
limits; daily scheduling/reopen; fixed links; iframe disposal; and unchanged custom
worker network denial. A positive checker transport control must accompany negative
worker controls. Local prototype traffic is not a deployed HTTPS/Firefox proof.

Exercise each unfinished-work category independently, edits after opening help,
storage failure, active publication, same viewer opening multiple boards, multiple
copies/tabs and shared-file reload behavior. Native OS manual package replacement
and helper restart are separate user-guide qualifications, not mocked browser writes.
Run appropriate package/unit/Playwright checks on PR/main CI. No runtime updater,
release package or hosted checker is implemented by this architecture document.

## References and source boundaries

- [Current release preparation](../../scripts/prepare_release.py),
  [publishing](../../scripts/publish_release.sh), [demo builder](../../scripts/build_demo.py)
- [Storage](../reference/STORAGE.md), [board upgrades](../../scripts/board-upgrade.js),
  [extensions](../../scripts/extension-runtime.js), [signing](../../scripts/signing-ui.js)
- [CSP policy inheritance](https://www.w3.org/TR/CSP3/#security-inherit-csp)
- [Cross-document messaging security](https://html.spec.whatwg.org/multipage/web-messaging.html#security-postmsg)
- [GitHub Pages and data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub API CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
- [GitHub release assets](https://docs.github.com/en/rest/releases/assets)

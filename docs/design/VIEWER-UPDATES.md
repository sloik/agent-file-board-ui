# Viewer self-update architecture

Status: architecture agreed with the owner. Implementation has not started.
The browser transport and a bounded isolation prototype have been investigated;
real viewer-file permissions, replacement and recovery remain implementation gates.

## Agreed user behavior

1. Check for stable releases once a day while the viewer is open, with an overdue
   check on reopening. Show a notice; never install automatically. Editing and
   offline use remain available if checking fails.
2. Install only after an explicit action. Installation and reload are separate.
   Show both the installed version and the version this tab is still running.
3. Reload only on explicit action, after unfinished work is completed or explicitly
   discarded and active operations finish. Comprehensive draft recovery is outside
   initial scope; never pretend existing form storage covers every draft.
4. Use browser-based replacement in supported Chrome/Edge. Firefox and other
   unsupported browsers get verified download and manual replacement. No installed
   helper or background application is required for the initial release.
5. Manage the selected viewer installation independently of board data. One viewer
   can open many boards, or projects can each use separate viewers. No required
   adjacency to `.agent-board`, per-board HTML copy or scan for other installations.
6. Preserve Git checkouts and offer an independent standalone viewer download.
   Do not modify tracked HTML or invoke Git. Source archives and customized/unknown
   files follow the same conservative preservation rule as a design default.
7. Replace a selected standalone viewer in its shared/Dropbox location. Normal
   sync may deliver the changed file to other computers; open tabs keep their
   current code until reloaded. The viewer cannot confirm sync completion.

## Installation setup and distribution modes

The user declares a standalone installation or a source checkout/archive. A file
handle does not expose ancestor directories, so do not claim reliable Git detection
from a filename or version. Granted-directory observations can inform the UI but
cannot prove absence of an ancestor `.git`; worktrees may use a `.git` file.
Unknown/source mode offers a standalone download without writing into that tree.

For in-place updates, the user selects the viewer's containing folder and the
exact HTML inside it. The containing-folder grant provides a writable sibling
backup destination; selecting only HTML does not imply that permission. Show the
selected file and dedicated `viewer-update-backups` folder before first install.
This registration is independent of selected board folders and is remembered
locally, with permission rechecked/renewed on explicit user action.

Recognize eligible original bytes through their known published release digest.
Two copies can have identical bytes: this proves eligibility, not that the selected
handle is the file running in this tab. Selection is the user's declared target.
After reload, confirm the actual running version instead of assuming success.

| Distribution | What an update does |
| --- | --- |
| Standalone HTML or release/demo ZIP | Replace only selected viewer HTML; board data, examples, packaged helpers and guides stay untouched |
| Git checkout or source ZIP | Preserve source files; offer standalone viewer download |
| Unknown or customized HTML | Preserve it; offer standalone download and explain registration |

A newly downloaded standalone copy is a separate installation. Do not promise
that file-origin settings, permissions or private trust automatically migrate
with a new location. Opening a download must not close the old tab or discard work.
Legacy HTML without updater controls needs a one-time manual replacement/download.

## Components and trust boundaries

**Update controller:** owns schedule, fixed GitHub endpoints, release discovery,
bounded downloads, candidate verification, selected installation and state reporting.
Store update metadata privately, not in board messages/config. Coordinate scheduled
checks where local browser storage permits; if persistence/coordination is unavailable,
fall back to manual checking instead of repeated automatic requests.

**Release candidate:** bind repository, release ID, stable version, exact commit,
asset ID, expected byte count and SHA-256 into one candidate. Retrieve the exact
commit's bundled HTML through the GitHub raw-content API and require it to match
the published release asset digest. Source at a tag alone is insufficient. Use
explicit discovery cache policy and commit-addressed content. Revalidate identity
before install; never silently substitute a different candidate or downgrade.
Hash original bytes, not decoded/re-encoded text; inspect version as data and never
execute a candidate for validation.

A read-only Chromium probe obtained the current released HTML byte-for-byte
through the raw API; direct release-asset fetching failed. This supports the API
route, not a blanket claim about every browser/endpoint. Firefox needs its own
transport/download test. API rate limits and network failures mean latest unknown.

**Extension isolation:** the current parent CSP has `connect-src 'none'` and
[extension-runtime.js](../../scripts/extension-runtime.js) creates `data:` workers.
Those workers inherit parent policy. Merely allowing GitHub in the parent would
also give custom code a network destination. JavaScript fetch wrappers or allowed
URL paths do not restore the existing isolation guarantee.

The selected implementation structure is a fixed trusted opaque iframe with an
additional strict `connect-src 'none'` policy. It creates extension workers and
proxies bounded jobs/results through a channel bound to its exact window and
session. Custom component code stays exclusively in workers. The parent may
perform bounded update fetching; the child additionally forbids frames and other
network resources. An iframe cannot relax an inherited parent network prohibition,
so putting the updater in `srcdoc` while leaving parent networking forbidden is
not a solution.

A bounded file-origin Chromium prototype confirmed the distinction: a direct
worker under a network-enabled parent reached an actual HTTP endpoint; a stricter
opaque child, its worker and a nested worker made no request. This is an architecture
feasibility check, not the production broker or complete security qualification.
Actual extension lifecycle, cancellation, budgets, forged messages, fetch/XHR,
WebSocket, imports and nested-worker transport controls must pass before enabling
updater networking. Keep all existing worker/extension regression coverage.

**Installer:** owns permission renewal, backup, serialized browser writes,
precommit checks, postcommit verification and recoverable state. Prefer
`createWritable({mode:'exclusive'})` and verify required exclusivity is supported;
never silently accept overlapping writers. Retain and reread an exact backup
before replacing the live viewer. The browser writable stream stages bytes and
commits on close; do not claim direct OS rename/fsync APIs are available to HTML.
Reread/hash original target around the final commit boundary, coordinate local
installers/critical application operations and verify actual installed bytes.

Browser exclusivity is not cross-process/cloud compare-and-swap. Dropbox or another
computer can race the final check/close. Detect changes where observable, preserve
backup/transaction evidence and explain conflicts; do not promise global locking.

**Reload gate:** recheck immediately before reload. Cover raw composer text
(including whitespace), routing/new-room/new-topic/reply state, structured
attachments, modified v1 choices, v2/v3 forms, extension replies, voice capture or
uninserted review, authoring/builder changes, pending/failed storage and in-flight
signing/publication/package installation/board migration. Initialized default
forms are not dirty merely because a draft Map contains an entry. A discard
control must name its exact category; it cannot undo committed publication.

Reload starts signing locked. Do not persist imported private keys. Existing
private trust/floor state stays separate. Native folder permissions may need
renewal; upload snapshots require reselection. Changing board selection must not
retarget the installed viewer or let unrelated drafts escape the reload guard.

## User-visible states

| State | Behavior |
| --- | --- |
| Unregistered/source installation | Explain current mode; configure standalone target or download a separate viewer |
| Checking | Nonmodal status; browsing/writing remain available |
| Check failed/offline | Latest unknown; retry manually; do not say up to date |
| Update available | Show running/target versions and changes; Install, Later or Skip |
| Downloading/verifying | Progress/cancel; installed bytes untouched |
| Ready to install | Confirm declared target, permission, original hash and verified backup |
| Installing | Serialize target commit; no automatic reload or board migration |
| Installed; reload pending | “X is installed. This tab is still running Y.” Keep working or Reload |
| Reload held by work | List unfinished categories and offer Return to work or scoped explicit discard |
| Reloaded | Confirm running version; signing locked; reopen board subject to permission |
| Download-only browser | Offer verified viewer download; do not claim manual installation completed |
| Recovery needed | Classify actual target/backup bytes before offering retry/restore |

## Recovery and release guarantees

- Fixed public UI repository and stable published releases only. Reject missing or
  ambiguous assets, wrong version/hash/size, oversized or invalid content and
  unexpected identity changes. Bound metadata, HTML and elapsed transfer time.
- A GitHub API digest fetched over HTTPS verifies matching bytes within the GitHub
  trust channel. It is not independent publisher authentication. Existing release
  preservation policy is not proof of enforced immutable releases or signed
  manifests. Board identity keys must not authorize executable releases.
- Retain original/candidate hashes and transaction phase beside recoverable backup
  material. A crash before close normally leaves old bytes; a missing completion
  marker does not establish that commit failed. Classify actual disk bytes.
- If target matches neither expected version, preserve it and stop automatic
  recovery. Never overwrite subsequent edits, steal a live writer or recursively
  delete unknown recovery material.
- Recovery must be possible outside a broken new viewer: explain manual restoration
  of the backup to the original selected path. A failed download or backup write
  cannot replace the current viewer. Downloads beginning do not prove files saved.
- Restoring older HTML does not undo IndexedDB/schema migrations. Declare a
  rollback compatibility floor or retain backward-compatible state before offering
  rollback. Never weaken signing trust/floors as a recovery shortcut.
- A future release manifest can include helper/storage compatibility and verified
  metadata. Independent signing needs a separate release root and rotation policy;
  immutable releases/attestations require an actual verifier. Neither is implied
  by current asset checksums. Background helpers and helper self-update are outside
  the chosen initial scope.

Current release/source boundaries:
[preparation](../../scripts/prepare_release.py),
[publishing](../../scripts/publish_release.sh),
[consistency checks](../../scripts/release_check.py),
[board upgrades](../../scripts/board-upgrade.js),
[storage](../reference/STORAGE.md),
[form persistence](../../scripts/form-board.js),
[authoring](../../scripts/authoring-drafts.js),
[extension drafts](../../scripts/extension-ui.js),
[signing](../../scripts/signing-ui.js), [locations](../../scripts/locations.js).

## Implementation sequence and verification

1. Qualify the stricter extension-worker broker and preserve all existing lifecycle,
   output-budget, focus/draft and network-isolation controls before relaxing parent
   update networking.
2. Add release discovery/verification, private schedule state, update notice,
   source/unknown preservation and Firefox download fallback. Test actual API
   transport, cache/rate-limit failures and byte-level candidate identity.
3. Add standalone target registration, containing-folder/backup setup, exclusive
   stream installation and independent recovery. Test actual selected HTML writing
   through close/reread/reload on supported desktop platforms; simulated filesystems
   or OPFS do not prove native picker permissions or OS/sync behavior.
4. Add full dirty-work/active-operation reload gates and installed-versus-running
   UI. Exercise edits after dialog opens, each unfinished-work category, storage
   failure, permissions revoked, wrong identical-copy selection, multiple tabs,
   interrupted download/write/close, external replacement and rollback compatibility.

Additional acceptance: one viewer can open multiple boards; updating one of several
viewer copies leaves others alone; source checkouts remain untouched; shared-file
sync never forces another tab to reload or claims a distributed transaction.
Run unit and meaningful Playwright tests in PR/main CI. Platform-specific native
permission/replacement qualification is separate from mocked tests. No runtime
implementation or complete installation qualification is claimed by this document.

## References

- [CSP inheritance and additional policies](https://www.w3.org/TR/CSP3/#security-inherit-csp)
- [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
  and [persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api/)
- [Exclusive writers](https://developer.chrome.com/blog/new-dev-trial-for-multiple-readers-and-writers/),
  [external filesystem changes](https://fs.spec.whatwg.org/#files-and-directories)
- [Mozilla picker support](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json),
  [origin/storage](https://storage.spec.whatwg.org/#storage-keys)
- [GitHub raw content](https://docs.github.com/en/rest/repos/contents#get-repository-content),
  [API CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests),
  [release assets](https://docs.github.com/en/rest/releases/assets)
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases),
  [release verification](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)

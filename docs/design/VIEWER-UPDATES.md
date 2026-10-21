# Viewer self-update architecture

Status: proposal under discussion. Checking cadence, installation/reload consent
and helper setup are awaiting owner choices. Recommendations below are not
approved product behavior. Runtime implementation is outside this design task.

## Current behavior and boundaries

The viewer is the local `board.html` executable. Refreshing board data and
upgrading board metadata do not replace that executable. The existing
[update guide](../guides/UPGRADING.md) requires manual viewer replacement.
The viewer's CSP has `connect-src 'none'`. The selected board directory is not a
grant to replace the HTML from which the viewer was opened.

Installation changes bytes on disk. Already-open tabs continue executing their
loaded version. The UI must distinguish **installed version** from **this tab's
running version**. Updating the viewer must never implicitly migrate board files.

Current reload recovery is incomplete:

- Ordinary composer body, routing and reply context, v1 choice drafts and extension
  reply drafts are held in memory.
- V2/v3 form drafts and authoring workspaces have separate persistence queues and
  failure modes. Authoring recovery does not restore ordinary message routing/body.
- Voice capture/review and in-flight publication need explicit lifecycle handling.
- Imported signing keys remain in tab memory. Reload requires explicit unlock;
  private trust/floor evidence is separate durable state.
- Native folder handles can be remembered, but permission must be checked again.
  Uploaded snapshots require files to be selected again after reload.

Source boundaries: [composer and choice state](../../board.html),
[form persistence](../../scripts/form-board.js),
[extension drafts](../../scripts/extension-ui.js),
[authoring recovery](../../scripts/authoring-drafts.js),
[locations](../../scripts/locations.js), [signing](../../scripts/signing-ui.js),
and [storage contract](../reference/STORAGE.md).

## Delivery alternatives

| Route | User experience | Main consequence |
| --- | --- | --- |
| HTML-only manual replacement | Download/import a release, replace the file, reopen | No helper installation; currently implemented fallback |
| Browser-granted viewer file | Select actual viewer HTML and grant write access | Supported browser required; board access is insufficient; release-download transport still needed |
| Optional local updater | Register one viewer, install a verified release, then reload | Keeps file path and restrictive board CSP; helper setup/lifecycle required |
| Managed launcher | Open Agent File Board through a launcher which manages its viewer | Predictable central installation; platform packaging and bootstrap work |
| Local/hosted web viewer | Open a stable HTTP(S) URL | Different delivery model; storage/origin migration and board write access need separate design |

An optional local updater is the recommended candidate **if setup is acceptable**.
Keep one registered viewer at its existing path. The updater owns release
checking, staging, target verification, locking, backup, replacement and recovery.
The board owns unsaved-work detection and reload readiness. The standalone HTML
continues to work without the updater.

The existing [voice helper transport](../../scripts/voice-input.js) demonstrates
separate loopback-window messaging under the current CSP. Reusing that pattern
does not give a transcription helper arbitrary update authority. Updater requests
need their own narrow authentication, protocol version and installation binding;
no arbitrary path, command or download URL from page messages. The existing
[desktop opener](../../scripts/install_desktop_opener.py) is macOS-only and is not
an updater.

A legacy HTML with no update controls needs one externally initiated bootstrap:
manual replacement, updater setup or launcher installation. No design can add
new update code to an already-loaded legacy file without this transition.

## Proposed user-visible states

| State | Visible behavior and actions |
| --- | --- |
| Not configured | Explain setup and manual download; offline viewing remains available |
| Ready / checking | Show current version and last successful check; editing remains usable |
| Check failed | Latest unknown; retry later; do not display a false up-to-date result |
| Update available | Target version, changes and selected installation; Install, Later or Skip |
| Downloading / verifying | Progress and cancellation; installed bytes untouched |
| Ready to install | Recheck selected target identity and exact original bytes |
| Installing | Serialize this installation, retain backup, replace only verified bytes |
| Installed; reload pending | Show installed X and running Y; Keep working or Reload |
| Reload held by work | Identify unfinished work or active capture/publication; return to it |
| Reloaded | Confirm running target version; reopen board subject to permission; signing locked |
| Install/recovery failed | Explain actual classified disk state; retry or independent recovery |
| Rollback available | Restore a supported retained viewer explicitly; reload is a separate action |

For an initial implementation, updater-initiated reload should wait while any
memory-only work exists. Offering immediate reload with full draft restoration
requires a new complete checkpoint contract, not just awaiting today's form queue.
That larger contract would cover message text/routing/new-room/topic/reply source,
structured attachments, choices, extension replies and voice review, tied to the
correct board/respondent/source and committed before reload.

## Release selection and installation invariants

- Use published stable releases from the fixed UI repository. Match repository,
  release and asset identity, version, byte count and digest. Inspect embedded
  version as data; never execute downloaded HTML for validation. Refuse implicit
  downgrades; rollback is explicit.
- Verify before replacement. An API digest retrieved over GitHub HTTPS verifies
  matching bytes within that same trust channel; it is not independent publisher
  authentication. Existing release preservation policy must not be mistaken for
  enforced immutable releases or signed manifests. Board participant keys must
  not authorize executable releases.
- Bind to one explicitly registered regular viewer file. Reject ambiguous or
  unsupported symlink targets and changed bytes. Unknown/local modifications
  should initially result in a separate download, preserving the modified file.
- Serialize cooperating local updaters for that target. Retain exact original
  bytes and an installation transaction record, stage beside the target, flush,
  recheck expected target bytes and replace. Never truncate live HTML in place.
- Recovery classifies actual target/backup hashes before offering actions. A
  missing completion marker does not prove replacement failed. If bytes match
  neither version, preserve them and stop automatic recovery.
- Local locks do not coordinate cloud-sync writers or another machine. Shared
  Dropbox installations need an explicit product decision. Windows busy-file,
  permission, filesystem durability and cloud-sync behavior need platform checks.
- Rollback must respect persisted-state compatibility. Restoring old HTML does
  not undo IndexedDB migrations. Define a compatibility floor before automatic
  installation or rollback promises.
- The first updater does not update itself. Version its protocol and provide an
  explicit compatible installer for future helper upgrades.

The current release preparation/publishing pipeline already binds assets to the
checked source and preserves published releases:
[preparation](../../scripts/prepare_release.py),
[publishing](../../scripts/publish_release.sh),
[consistency checks](../../scripts/release_check.py).
An updater manifest can add version/hash/size, canonical bundle version, helper
protocol and persisted-state compatibility. Generate it from tested bytes.
Independent signing needs a separate release trust root and rotation/revocation
policy. GitHub immutable releases/attestations are another option with a real
verification dependency; neither mechanism is assumed to exist today.

## Candidate first implementation

Subject to answers: one registered copy, stable release checking, explicit
verified installation with backup/recovery, independent installed/running version
status, explicit safe reload and manual fallback. No forced other-tab reload,
update-all scanning, automatic board migration or comprehensive draft restore in
this first scope. Background checking/staging and a managed launcher are separate
increments if requested.

Meaningful verification scenarios include offline/rate-limit checks; wrong asset,
digest or embedded version; modified target; canceled/failed download; backup or
replacement failure; crash before/after replacement; changed recovery target;
multiple updater processes; two tabs and two copies; unsent composer/form/choice/
extension/voice work; pending/failed draft persistence; pending signing/file close;
locked signer after reload; revoked folder permission; upload reselection; and
rollback with incompatible storage. Synthetic failures and actual platform
replacement checks prove different boundaries and must be reported separately.

## Owner questions

Initial questions currently pending:

1. Check automatically at most once per day with a notice, check only manually,
   or install automatically when idle?
2. Explicit install followed by reload prompt, manual file replacement, or
   automatic reload after all unfinished work is durably preserved?
3. Optional helper installation, strictly HTML-only use, or managed launcher?

Next decisions to ask after those answers:

- One viewer shared by boards versus many viewer copies; update current copy or
  all registered copies?
- Shared/cloud-synced viewer versus a private installation on each computer?
- Keep working until explicit reload versus comprehensive immediate recovery?
- Preserve customized HTML as a separate copy versus explicit replacement backup?

Reload keeps signing keys session-only; do not make key persistence the price of
convenient updates.

## Platform and release references

- [CSP connect-src](https://www.w3.org/TR/CSP3/#directive-connect-src)
- [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
  and [persistent permission behavior](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api/)
- [Origin and file URLs](https://url.spec.whatwg.org/#origin),
  [storage keys](https://storage.spec.whatwg.org/#storage-keys)
- [Service worker registration](https://w3c.github.io/ServiceWorker/#dom-serviceworkercontainer-register):
  HTTP(S) control does not replace a standalone file on disk
- [GitHub release assets](https://docs.github.com/en/rest/releases/assets),
  [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases),
  [release integrity verification](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)

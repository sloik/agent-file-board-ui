# Offline board extension architecture

Research proposal, 2026-10-19. Extension support is not implemented. The owner
approved the boundaries below, including a constrained SDK for custom code.
Browser notifications are separate viewer functionality.

Companies should be able to start with the standard file board, add their own
components, and share the complete board folder without a server or a
company-specific viewer build. An extension adds capabilities through a public
API; it cannot replace the board's parser, routing, identity or write rules.

## One package with two optional facets

| Facet | Contents | Consumer |
| --- | --- | --- |
| Convention | Contract meanings, bounded schemas, examples and agent guidance | Agents, CLI and viewer validation |
| UI | Declarative views or compiled custom components targeting named contracts | Viewer |

A package may contain either facet or both. UI-only means presenting an existing
contract differently. A component introducing new persisted data or answers
also needs a convention contract. The rendering framework is not part of the
message protocol, and canonical Python remains standard-library only.

### Distribution and installation

Use one self-contained UTF-8 JSON artifact, provisionally `*.afb-plugin.json`.
It contains a manifest and bounded file entries with exact UTF-8 or base64 bytes.
This avoids a ZIP parser, decompression bombs and archive extraction during
browser installation. Package authors may use their own build tools; recipients
need only the standard viewer and local artifact. All dependencies and assets
are included ahead of time. No runtime npm resolution, CDN, remote schema or
network import is permitted.

The manifest contains format version, namespaced package ID, package version,
display name, publisher claim, file digests, optional facets, exported contract
and renderer identities, compatibility constraints and requested capabilities.
Publisher text and hashes do not authenticate a company. Approval is a local
decision about the exact package contents.

The complete artifact's SHA-256 is calculated over its original bytes. It does
not contain its own hash. Entry hashes are calculated over decoded bytes; reject
duplicate JSON keys, noncanonical base64, duplicate/unsafe entry names and
unsupported fields before installation. Names are logical package entries,
never arbitrary filesystem destinations.

Retain approved packages under an additive `.agent-board/extensions/` subtree:

```text
extensions/
  registry.json
  catalog.json
  packages/<artifact-sha256>/package.afb-plugin.json
  packages/<artifact-sha256>/contracts/...
```

The artifact remains authoritative. Expanded contract files and the catalog are
derived, digest-checked conveniences for local models. They cannot silently
change a package. A staged import becomes enabled only after all referenced
bytes are present and verified; readers tolerate incomplete copies as unavailable
extensions. Never overwrite sent messages or old package snapshots.

Separate these operations:

1. Import and inspect a local artifact.
2. Register exact package bytes on the board and select defaults for new posts.
3. Locally approve executable code for that exact version and artifact hash.

Copying the board transfers contracts, examples, code and assets. It does not
transfer executable approval or local display preferences. Declarative views
require validation, but no arbitrary-code approval. Board enablement follows the
board owner's collaboration policy; the file board does not provide authenticated
administration or prevent another filesystem writer editing its registry.

## Runtime decision

Use a dedicated opaque-origin worker for custom code and trusted host rendering
for its output. The owner selected this route after the browser probes found
WebRTC egress from an otherwise restricted iframe.

Both rendering modes target the same versioned drawing/input vocabulary:

- Declarative views describe bounded trees, layouts, assets and inputs.
- Compiled JavaScript components compute those trees, handle local events and
  maintain ephemeral component state inside the worker.

The host owns DOM creation, safe style values, local asset decoding, keyboard
interaction and trusted posting controls. The vocabulary can include layout,
text, inputs, tables and bounded vector graphics without admitting raw HTML,
URLs, executable callbacks or unrestricted CSS. New host primitives require a
public API change; their omission cannot be bypassed by a package.

This supports custom compiled components, but does not promise unchanged reuse
of arbitrary React DOM libraries. Components needing `document`, DOM refs,
portals, layout measurement or browser APIs need adaptation. React bindings can
target a custom reconciler; that adapter must remain internal and pinned because
React's reconciler interface is experimental. The public plugin API is the
versioned drawing/event protocol, independent of React or OpenUI internals.
[React createRoot](https://react.dev/reference/react-dom/client/createRoot),
[React reconciler](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md).

### Confinement and lifecycle

The viewer supplies a restrictive inherited CSP before creating a local `data:`
worker. Permit the local worker bootstrap while blocking network connections,
runtime script imports and evaluation. An opaque worker cannot use the host's
origin storage, DOM or navigation and does not expose `RTCPeerConnection` in the
tested browser. A trusted bootstrap removes nested worker constructors before
executing plugin code. Do not patch `fetch` and call that a security boundary.
[Worker policy inheritance](https://html.spec.whatwg.org/multipage/browsers.html#policy-containers),
[worker interfaces](https://html.spec.whatwg.org/multipage/workers.html#the-workerlocation-interface).

Receive only the current validated payload, bounded display context and
previously admitted local assets. Do not pass board handles, other conversations,
credentials, participant registry contents, opener access or host functions.
Approve a minimal capabilities vocabulary such as `render` and `propose-reply`;
unknown or broader powers are rejected, not silently ignored.

Bind bridge traffic to artifact/renderer identity, instance token, board
generation, source message and contract digests, respondent and revision. The
host validates complete messages and rejects unknown fields, unsupported nodes,
URL-bearing styles/attributes, invalid event IDs and oversized/deep output before
touching the DOM. The host must also bound worker output, update frequency,
active instances, asset decoding, startup time and idle resource use. Close ports,
terminate workers and invalidate generations when navigating, changing board or
identity, disabling a package, or replacing a renderer. Late replies fail closed.

Worker termination contains ordinary infinite loops without blocking the host
in the tested case. Browser-wide memory exhaustion and implementation bugs are
not fully solved by workers or approval. Production qualification still needs
bounded adversarial tests in each supported browser. Disable custom code where
the required isolation primitives are unavailable; keep the readable fallback.

### Reply authority

A plugin can collect an answer and propose a typed reply. It cannot independently
post or choose sender identity, arbitrary paths or destinations. A trusted host
submission control lets the person review and explicitly submit. The host then
rechecks source bytes, contract, respondent, destination and current board,
validates the answer independently and invokes the existing append-only writer
or download flow. An answer records a response; it does not itself execute an
external task or grant additional authority.

Creator documentation must say: **if a plugin needs more powers, different core
behavior or an additional host primitive, open an issue in the board project**.
No network/API/credentials capability is part of this first API.

## Convention and validation

Keep existing `board-report`, `QUESTION` and `ANSWER` versions frozen. Add an
explicit new extension envelope in a coordinated convention/viewer release,
provisionally a separate `EXTENSION` metadata header. This is design notation,
not a currently supported posting API. Each instance carries a namespaced
contract identity, exact contract version and digest, bounded data, and original
renderer reference when applicable. Custom responses additionally bind the exact
source message path/content digest and answer contract.

Define a small shared schema dialect rather than claiming full JSON Schema
support. Include closed objects, required properties, primitive types, nullable
values, enums, finite numbers, bounded strings/arrays and limited local
composition. Reject unsupported keywords, remote references, regex execution,
executable validators and unbounded recursion. Define Unicode scalar counting,
safe integer limits, duplicate-key handling, null versus absence and numeric
comparison identically in Python and JavaScript. Publish shared positive and
negative fixtures as part of the future contract. Cross-field business rules
need an explicitly bounded declarative rule vocabulary; custom UI code is never
the sole authority for validating an answer.

Every extension message must keep a nonblank readable body. Readers distinguish:

| State | Behavior |
| --- | --- |
| Known contract, valid data, compatible approved renderer | Render custom UI |
| Known contract, valid data, unavailable/unapproved renderer | Summary and compatibility notice; no custom controls |
| Unavailable contract | Summary; explicitly incomplete semantic validation |
| Invalid envelope or known payload | Isolate diagnostics and disable controls |

The current 2.4.0 CLI ignores an unknown top-level `EXTENSION` header in the
tested core-valid message. Its exit zero therefore does not validate extension
semantics. It still rejects unsupported types inside existing `UI` libraries.
Writers must require the new extension-capable toolchain rather than infer
capability from legacy validation success.

## Compatibility, history and local renderer choice

Keep package releases, contract versions and viewer extension API versions
separate. Declare convention and viewer/API compatibility independently. Use
stable three-part numeric versions, explicit comparator ranges, optional upper
bounds and exclusion lists; exclusions win. Treat prerelease versions as
unsupported unless explicitly named. Publish one bounded comparator grammar and
shared Python/JavaScript fixtures instead of depending on npm-specific syntax.
Unknown compatibility syntax disables the package. Compatibility requires all
constraints, not merely equal major versions.

For example, a package can support convention `>=2.5.0 <3.0.0`, excluding
`2.5.2`, and extension API `>=1.0.0 <2.0.0`, excluding `1.1.1`. These numbers are
illustrative, not planned releases. A corrected compatibility manifest is a new
immutable package release; there is no online revocation dependency.

An immutable message pins its original contract bytes and renderer. Installing
a new package does not change that message. Retain historical definitions and
renderers; disable their execution independently of retention.

A replacement renderer declares supported contract identities/version ranges
and exclusions. The host resolves those against the exact historical digest;
conflicting bytes for the same contract ID/version are an error. The person may
explicitly choose a compatible installed renderer for a contract, scoped to
this viewer, and revert to the original. New renderer bytes need their own code
approval. Switching renderers never migrates payloads, changes contract meaning
or edits a message. Invalidate pending UI/drafts on a switch and keep the
original fallback available. If fixing a bug requires changing data semantics,
publish a new contract and a new corrective message.

## Agent and author workflow

Expose a small local catalog of enabled IDs, summaries and compatible contracts.
Agents request exact schema/guidance/examples on demand, through future
`boardctl extensions list/describe` commands or direct local files. These
commands do not exist yet. Do not concatenate every package into the core
convention or promote package prose above the agent's governing instructions.

Authors define a contract, optional view/code, examples and compatibility; a
local builder validates them and emits one artifact. Enable that artifact on a
disposable board. Reuse Structured message's validate, preview, immutable
attachment and explicit posting workflow. Test unsupported readers, missing
packages, copied offline boards and historical renderer switching. Sharing is
ordinary file copying or an existing repository; no marketplace is required.

## Evidence and implementation boundary

[Reproducible probes and results](research/extensions/README.md) document actual
Chromium 151 file-page behavior. The worker UI probe demonstrates interactive
custom code, typed reply proposals, host admission failures, stale-event
rejection and disposal. It is deliberately a tiny research vocabulary, not a
production renderer, schema engine, installer or security certification.

The research closes the architectural runtime choice. Implementation still
needs a versioned SDK/bridge, cross-language fixtures, actual board lifecycle
integration and browser qualification. Those are implementation acceptance
criteria, not evidence that the plugin feature already exists.

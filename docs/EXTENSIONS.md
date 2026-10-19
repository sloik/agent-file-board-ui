# Offline extensions — viewer and SDK 1.0.0

Use **Extensions** in the stock viewer to inspect and import a local
`*.afb-plugin.json` file, then explicitly install/enable it. Packages, assets and
contracts live inside the board folder. Copy that folder to another computer
and it works offline. Custom code requires approval in that computer's browser
profile; copying a board never transfers approval. The viewer does not install
npm packages or contact a registry.

The [canonical package and message guide](https://github.com/sloik/agent-file-board/blob/main/docs/EXTENSIONS.md)
defines the exact format, bounded schema dialect, version ranges/exclusions,
SHA-256 fingerprints and CLI commands. A package has a convention facet, a UI
facet, or both. UI-only renderers target retained convention contracts. Built-in
reports/forms keep their existing meanings and renderers.

## Import, author and upgrade

1. Open a native board and **Extensions**. Choose a local artifact. Review the
   manifest, facets, versions, capabilities and hash before **Install and enable**.
2. Expand **Inspect manifest and source** to read packaged code and files.
   Worker packages require **Approve these exact code bytes** before any code runs.
   Approval/revocation is browser-local. Storage failure is shown as session-only.
3. Use **Compose example** to open a contract's example in structured authoring.
   Edit its envelope/data, validate/preview, attach, and write a readable fallback
   in the normal composer. Preview does not submit replies.
4. Controls collect a reply proposal. Open **Review typed reply**, inspect/edit
   the JSON and explicitly send it. The trusted host validates the answer schema,
   participant, route, selected context and fresh original bytes before posting.
5. Install a new version alongside the old one. Existing messages default to
   their original pinned renderer. Their renderer selector offers compatible
   retained alternatives; changing it is local and reversible through **Original
   renderer**. It never rewrites message data or changes its contract definition.
   A replacement must declare support for the original contract version; package
   and contract exclusions win over ranges. Changed worker bytes need new approval.

Browser registry writes use local Web Locks and recheck the current registry;
a changed registry requires a fresh inspection. CLI writers and offline syncing
replicas do not form a distributed transaction.

Disable retains all snapshots and original messages; new posts/answers and
rendering stop using disabled packages. Historical contract validation remains
possible. Missing, incompatible, conflicting or unapproved renderers leave the
readable body visible. No silent migration or automatic update occurs.

Uploaded/read-only boards can read contained packages and compose/download
messages. Import previews there offer an exact-byte package download rather than
claiming installation. To install, use the native folder permission or canonical
CLI; include `extensions/registry.json` and all snapshots in the copied board.
Offline downloads cannot check later disk changes: their source hash is checked
when validated against the destination board. Reply drafts survive ordinary
refresh in memory; changing board, identity, view or renderer clears them.

## Drawing vocabulary

A declarative entry is one JSON tree. A worker returns the same tree. All nodes
have `type` plus exactly the fields below; unknown fields/types are rejected.
There is no raw HTML, CSS, resource URL, callback or script-valued attribute.

| Type | Fields |
| --- | --- |
| `column`, `row` | `children`: array of nodes |
| `text`, `heading` | `text`: scalar or data binding |
| `metric` | `label`, `value`: scalar or data binding |
| `table` | `columns`: scalar labels; `rows`: array of equal-width scalar arrays, or binding |
| `input` | `name`: answer-object property, `label`, `inputType`: text/number/checkbox/textarea |
| `select` | `name`, `label`, `options`: array of strings |
| `button` | `label`, `event`: kebab identifier delivered to the worker |
| `image` | `asset`: package file name; `alt`: scalar or binding |

A binding is exactly `{ "path": ["title"] }`, rooted at the message's data.
Paths are at most eight property names/array indexes. They cannot access globals
or inherited properties. Scalars become text only. Input names address top-level
answer properties; nested/array values can be reviewed in the host's JSON editor.
Renderer input/proposal capability is `propose-reply`. Contracts can also offer
host-reviewed JSON answers without a UI facet.

Limits: 64 KiB serialized drawing, 128 nodes, depth 8, 64 children, 100 table rows
and 16 columns; 10000 scalars per text, 64 select options of 200 characters.
Images are packaged PNGs up to 256 KiB and 2048×2048; no external image source or
SVG resource loading. Overflow remains scrollable on phones.

Example declarative entry:

```json
{"type":"column","children":[
  {"type":"heading","text":{"path":["title"]}},
  {"type":"input","name":"approved","label":"Approve request","inputType":"checkbox"}
]}
```

## Compiled code SDK

Bundle all dependencies into a single classic JavaScript entry. Call
`BoardExtension.define({render, event})` once. DOM-dependent React components
need adaptation to this drawing SDK. `render(data, state)` returns a tree.
`event(event, data, state)` may return `{state, answer}`; answer is only a proposal.
Inputs send `{type:"input", name, value}`; buttons send `{type:"action", name}`.
No host identity, path, filesystem handle, renderer authority or posting function
is passed to package code. The host owns input validation and final submission.

```js
BoardExtension.define({
  render(data, state) {
    return {type:'column', children:[
      {type:'heading', text:data.title},
      {type:'button', label:'Propose approval', event:'approve'}
    ]};
  },
  event(event, data, state) {
    if(event.type==='action' && event.name==='approve')
      return {state:{approved:true}, answer:{approved:true}};
    return {state};
  }
});
```

Each render/event runs in a fresh opaque-origin data worker, which is terminated
on the first result. State up to 16 KiB is returned through the host; result is
at most 64 KiB. At most eight jobs are active, with a one-second host deadline
and at most one event per 50 ms. Arbitrary bridge objects, malformed trees and
bad answers terminate the renderer. Detached/context-changed roots dispose jobs.
Module-level state is intentionally not retained between jobs; use SDK state.

The standalone page CSP blocks connections and imports; workers have no DOM,
RTC or origin storage. Trusted bootstrap removes nested worker constructors.
No unrestricted iframe/React DOM mode is provided. Executing arbitrary code
still consumes browser resources; these are bounded host jobs, not an operating
system memory quota or protection from a compromised browser.

## Extension creator scope

Extensions **only add through this public SDK and contracts**. They cannot
change core parsing, routing, identity, message history, statuses, permissions,
board scanning or write rules. Only render and propose-reply are supported.
If your plugin needs more powers or different core behavior, create a project
GitHub issue: [convention](https://github.com/sloik/agent-file-board/issues/new)
or [viewer/SDK](https://github.com/sloik/agent-file-board-ui/issues/new).
Do not bypass the SDK, ask users to weaken CSP, or require a custom viewer fork.

The canonical examples cover convention-only, both facets/declarative, and
UI-only/worker replacement. Package publisher text is a claim, not authenticated
company identity. Review exact source before approving code. New contracts need
new versions when schemas, guidance or examples change meaning. Viewer-local
renderer switching never changes the original contract.

No living-specification feature or dependency on an external execution tool is
included. The separate research proposal remains parked.

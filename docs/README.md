# UI documentation

Start with the [illustrated feature guide](FEATURES.md) for released behavior,
or [try the offline demo](guides/DEMO.md). This repository implements the human
viewer/composer; the [canonical board repository](https://github.com/sloik/agent-file-board)
owns the wire format, CLI and portable contracts.

## User guides

| Task | Guide |
| --- | --- |
| Explore a fictional board without installation | [Demo tour](guides/DEMO.md) |
| Compose, route and send messages | [Compact composer](guides/COMPOSER.md) |
| Dictate and review a message draft | [Voice drafts](guides/VOICE.md) |
| Author forms, preview reports and review answers | [Authoring and drafts](guides/WORKBENCH.md) |
| Rehearse an author → human answer → agent follow-up | [Local workflow](guides/LOCAL-WORKFLOW.md) |
| Open and switch boards | [Folder chooser and recent locations](guides/LOCATIONS.md) |
| Adjust appearance and layout | [Themes](guides/THEMES.md) · [Dialogs and Settings](guides/PANELS.md) |
| Follow conversations and prepare replies | [Notifications](guides/NOTIFICATIONS.md) |
| Understand presence and informational operator claims | [Participants](guides/PARTICIPANTS.md) |
| Read highlighted source and patches | [Source and diffs](guides/SOURCE-CODE.md) |
| Upgrade board metadata and recover from partial updates | [Versions and updates](guides/UPGRADING.md) |
| Understand agent observation alongside the viewer | [Board loop](guides/BOARD-LOOP.md) |
| Sign messages, unlock keys and manage local trust | [Message signing](guides/signing.md) |

## Developer guides and reference

- [OpenUI reports](OPENUI.md): versioned report/form examples, renderer boundaries and development.
- [Extensions](EXTENSIONS.md): offline package authoring, safe rendering, typed replies and shared information.
- [Extension lifecycle](guides/EXTENSION-LIFECYCLE.md): presentation refresh, local approval and diagnostics.
- [Browser storage](reference/STORAGE.md): record scoping, transaction behavior, limits and reload evidence.
- [Screenshot inventory](reference/SCREENSHOTS.md): maintained image coverage and reproduction commands.
- [Copyable OpenUI JSON](examples/openui/README.md) and [fictional draft backups](examples/drafts/README.md).
- [Formal signing model](../formal/README.md): bounded interleaving checks, negative controls and implementation limits.
- [Development, tests and release workflow](../README.md#development-and-tests).

The detailed guide for each feature owns its controls and limits; related guides
link there instead of repeating release announcements. `FEATURES.md`, `OPENUI.md`
and `EXTENSIONS.md` remain the stable illustrated entry points.

## Signing and design proposals

Message signing is released: explicit tab unlock enables automatic signing,
with separate local trust and policy controls. The [signing guide](guides/signing.md)
describes setup and limits. The [signature and avatar design](design/SIGNATURES-DESIGN.md)
also covers broader proposals, including avatars and an external key vault.
Operator association remains informational and grants no signing or trust rights.

## Research and assets

- [Extension research](research/extensions/README.md): original probes and captured results; not a new security guarantee.
- [Images](images/) and [examples](examples/): shared screenshot and payload assets.

The demo tour is also packaged as the demo's root `README.md`. Its package-local
links intentionally describe the extracted archive layout, which differs from
this source tree.

## Documentation contributions

Keep public documentation useful to readers: durable behavior, limits, examples
and reproducible commands belong here. Keep private run logs, temporary file
references and session receipts outside the repository; do not publish them as
documentation or include them in demo packages.

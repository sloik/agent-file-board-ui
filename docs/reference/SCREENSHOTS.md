# Screenshot inventory — UI 2.10.0

Images show the real local `board.html`, rendered in Chromium with disposable,
fictional boards and a folder-picker test adapter. No user boards are opened.
Captures assert clean browser logs and offline behavior where supported by the
scenario. They illustrate UI behavior; in-page notification captures do not prove
OS alert delivery, and presence/operator labels do not prove identity.

## Reproduce

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run screenshots:all       # stop if any capture/assertion fails
npm run screenshots:features  # only the newer workflows below
```

Images are written to `docs/images/`. Install dependencies from the locked tree
and keep the pinned canonical submodule initialized. Different OS fonts/emoji can
change pixels. Viewer clocks and message observation times are fixed for most
scenarios; the shared-information fixture also freezes the CLI producer clock.

## Feature coverage

| Feature | Desktop | Phone | Capture script |
| --- | --- | --- | --- |
| Conversation, unique identity colors, presence, guidance, Markdown/HTML, choices, repairs | [Overview](../images/board-overview.png), [identity](../images/board-identity.png), [presence](../images/board-presence.png), [guidance](../images/board-guidance.png), [choices](../images/board-choices.png), [HTML](../images/board-html.png), [repairs](../images/board-message-repairs.png) | Narrow layouts covered by specialized guides below | `screenshots.js` |
| Compact composer | [Collapsed](../images/board-composer-compact.png), [expanded](../images/board-composer-options.png) | [Collapsed](../images/board-composer-compact-phone.png) | `screenshot_features.js` |
| Local file actions | [Open file / containing folder](../images/board-file-actions.png) | Uses the optional desktop opener | `screenshot_features.js` |
| Human operator claim | [Participant details](../images/board-operators.png) | Same responsive participant dialog; native/upload phone regression coverage | `screenshot_features.js` |
| Notification follows and quick reply | [Center](../images/board-notifications.png), [sidebar menu](../images/board-sidebar-follow.png), [prepared reply](../images/board-notification-reply.png) | [Polish alert](../images/board-notifications-phone.png) | `screenshot_features.js` |
| Extensions and code approval | [Declarative component](../images/board-extensions-component.png), [manager](../images/board-extensions-manager.png), [approval needed](../images/board-extension-review.png) | [Worker component](../images/board-extension-refresh-phone.png) | `screenshot_features.js` |
| Component refresh and diagnostics | [Refresh](../images/board-extension-refresh.png), [log preview](../images/board-extension-diagnostics.png) | [Refreshable component](../images/board-extension-refresh-phone.png) | `screenshot_features.js` |
| Shared recorded/latest information | [100% recorded / 90% latest](../images/board-shared-information.png), [disconnected](../images/board-shared-information-disconnected.png) | [Comparison](../images/board-shared-information-phone.png) | `screenshot_features.js` |
| OpenUI report, modal and fallback | [Report](../images/board-openui.png), [modal](../images/board-openui-modal.png), [fallback](../images/board-openui-fallback.png) | [Report](../images/board-openui-phone.png) | `screenshot_openui.js` |
| Static dashboards and filters | [Dashboard](../images/board-openui-static.png), [details](../images/board-openui-static-details.png) | [Dashboard](../images/board-openui-static-phone.png) | `screenshot_static_openui.js` |
| Extended report catalogue | [Media](../images/board-openui-media.png), [specialty](../images/board-openui-specialty.png), [table](../images/board-openui-table.png) | [Media](../images/board-openui-media-phone.png) | `screenshot_static_candidates.js` |
| Typed forms and answer history | [Forms](../images/board-openui-forms.png), [historical answer](../images/board-openui-answer.png) | [Forms](../images/board-openui-forms-phone.png) | `screenshot_forms.js` |
| Conditional workflows and row edits | [Workflow](../images/board-openui-workflow.png), [rows](../images/board-openui-workflow-rows.png) | [Workflow](../images/board-openui-workflow-phone.png) | `screenshot_workflows.js` |
| Form builder, previews and saved drafts | [Builder](../images/board-form-builder.png), [authoring](../images/board-authoring-preview.png), [review](../images/board-answer-review.png), [drafts](../images/board-draft-manager.png) | [Review](../images/board-answer-review-phone.png) | `screenshot_tools.js` |
| Packaged demo | [Actual extracted ZIP](../images/board-openui-demo.png) | Form/report captures above | `screenshot_demo.js` |
| New/recent folder chooser | [Folder chooser](../images/board-locations.png) | [Chooser](../images/board-locations-phone.png) | `screenshot_locations.js` |
| Dracula and semantic colors | [Dracula](../images/board-dracula.png) | [Themes](../images/board-themes-phone.png) | `screenshot_themes.js` |
| Resizable settings and scrolling dialogs | [Wide settings](../images/board-settings-wide.png), [dialog](../images/board-dialog-scroll.png) | [Settings](../images/board-settings-phone.png) | `screenshot_panels.js` |
| Stable refresh toolbar | [Toolbar](../images/board-toolbar-stable.png) | [Polish toolbar](../images/board-toolbar-phone.png) | `screenshot_toolbar.js` |
| Board version update preview | [Preview](../images/board-upgrade.png) | [Preview](../images/board-upgrade-phone.png) | `screenshot_upgrade.js` |
| Shared source highlighting / split diffs | [Light](../images/source-diffs-light.png), [dark](../images/source-diffs-dark.png) | Responsive controls covered by source renderer regressions | Existing isolated shared-component illustrations; see [source guide](../guides/SOURCE-CODE.md) |
| Adaptive agent observation | [Interval table and operational guide](../guides/BOARD-LOOP.md) | CLI/skill capability, no viewer screen | No invented UI screenshot |

The source/diff illustrations isolate the shared renderer and remain applicable;
all full-board gallery captures above were refreshed with UI 2.10.0. The [signing guide](../guides/signing.md) includes two maintained source SVG
illustrations: [three independent tasks](../images/signing-three-tasks.svg) and
[an independent fingerprint comparison](../images/signing-key-comparison.svg).
They are explanatory diagrams, not captures of UI controls. Avatars remain a
design proposal.

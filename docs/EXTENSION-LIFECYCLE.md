# Extension lifecycle and diagnostics — SDK 1.2 (unreleased)

The canonical board owns the portable contract. Read the vendored
[full lifecycle reference](../vendor/agent-file-board/docs/EXTENSION-LIFECYCLE.md)
or its [public source](https://github.com/sloik/agent-file-board/blob/main/docs/EXTENSION-LIFECYCLE.md).

An **extension** is a package; a **component** is one rendered instance. The stock
viewer implements declared periodic/manual presentation refresh for worker and
declarative components, local diagnostics and a compact **Review extension**
indicator when the selected worker package lacks browser-local approval.

Refresh uses cached declared inputs. Ordinary board refresh reads files. External
agents/scripts collect observations and publish shared local artifacts. No source
command is executed by this viewer, and presentation refresh never renews an
observation or producer heartbeat. Hidden-tab timers are best effort; a closed
viewer runs nothing. Automatic component refresh is a local viewer preference
independent of board file polling.

SDK 1.2 packages declare `refresh` and per-renderer
`refresh: {intervalSeconds: 30}` (integer 30..86400). Older SDK viewers reject the
new capability/declaration accurately. SDK 1.2 custom hosts declining runtime
refresh must expose `supported:false`, show why refresh is unavailable, and retain
baseline rendering. Existing exact SDK 1.0/1.1 packages keep compatible behavior.

Diagnostics remain tab-local, bounded to 500 entries and 512 KiB, and clear when
switching boards. Component diagnostics filter to the selected package/instance;
Extensions also exposes all local diagnostics. Host and extension-authored records
are distinct. Review the explicit JSON export preview before downloading or
attaching it to an issue: arbitrary extension text can contain sensitive data.
No automatic telemetry, board writes or persistent log files are produced.

Approval is bound to whole package bytes. Updates may require new review even if
worker source appears unchanged. The component's review action opens exact-package
inspection without approving; readable content remains available. Installing a
new package does not switch an approved older pinned renderer.

Portable examples are
[lifecycle-worker](../vendor/agent-file-board/examples/extensions/lifecycle-worker.afb-plugin.json)
and
[lifecycle-declarative](../vendor/agent-file-board/examples/extensions/lifecycle-declarative.afb-plugin.json).
Install the canonical approvals contract example first; both lifecycle examples
target `com.example.approvals/request`. Select the renderer in the viewer, and
approve only the worker's exact package after inspection. The examples display
presentation time and do not collect a source reading.

# Offline extension runtime probes

Actual browser research on 2026-10-19, Chromium 151.0.7922.34 on macOS. The
scripts exercise local `file://` fixtures; they do not implement board plugins.
Run them from a checkout with the existing npm development dependencies and
Playwright Chromium installed:

```sh
node docs/research/extensions/probe.cjs /tmp/afb-extension-probes
node docs/research/extensions/egress-worker-probe.cjs /tmp/afb-extension-probes
node docs/research/extensions/worker-ui-probe.cjs /tmp/afb-extension-probes
```

HTTP(S) attempts are intercepted locally. WebRTC tests use an owned UDP listener
on 127.0.0.1 only. No outside service receives probe data. The scripts write
fixture HTML and JSON results into the specified scratch directory.

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| Local React in opaque sandbox frame | Renders, updates state, sends typed proposal | Local custom React delivery is technically feasible |
| Parent DOM/storage reads | SecurityError | Tested iframe cannot read these host surfaces |
| Frame fetch/image/worker attempt | CSP violations | Tested resource paths blocked; Worker constructor return alone is not proof of execution |
| Self-navigation with child-only CSP | HTTP navigation reaches interception | Child-only CSP does not close this path |
| Self-navigation with inherited parent frame-src | No HTTP request; CSP failure | Parent policy blocks the tested external navigation |
| WebRTC with restrictive CSP | 3 loopback UDP packets | HTTP restrictions do not establish zero network |
| WebRTC with `webrtc 'block'` | Directive unrecognized; 3 UDP packets | This browser cannot rely on the draft directive |
| Opaque data worker | No DOM/RTC; IndexedDB SecurityError; location unchanged | Useful isolation from host state and browser navigation |
| Worker fetch/importScripts/dynamic import | Errors; no HTTP requests | Tested inherited CSP blocks these egress paths |
| Worker WebSocket | Constructor returns, then CLOSED; no intercepted transport | Constructor success is not connection success |
| Worker infinite loop termination | Host stays responsive after terminate | Dedicated worker loop can be stopped in the tested case |
| Worker drawing/event bridge | UI updates and produces `{approved:true}` | Custom computed UI and reply proposals need no plugin DOM access |
| Invalid drawing output | Unknown kind/property/event and excess children rejected | Host can admit a restricted vocabulary before DOM creation |
| Old-generation events | Rejected; proposals unchanged | Generation checks isolate stale UI output |
| Local file notification capability | API exists, permission denied | Existence/secure context do not prove available system delivery |
| Service worker registration from file | TypeError, unsupported null origin protocol | Persistent notification actions do not fit this file-page environment |

Retained results: [iframe and file capabilities](results.json),
[WebRTC and worker](egress-worker-results.json),
[worker drawing bridge](worker-ui-results.json), and
[legacy header validation](legacy-header-results.json).
Local fixture paths in the retained iframe result are normalized; the scripts
produce actual paths. Socket state 3 is CLOSED. No system notification was
actually displayed by these research probes.

The legacy result used the repository's `tests/lib/helpers.js` to create a
disposable canonical example, added one core-valid message with an unknown
`EXTENSION` header and ran the pinned 2.4.0 `boardctl validate`. Exit zero proves
legacy acceptance only; that CLI does not validate the new header's semantics.

These are positive and negative path probes, not an exhaustive hostile-code or
memory-exhaustion audit. Only Chromium was available locally. Other browsers
must qualify the worker/CSP/origin behavior before enabling custom code.

Primary sources:

- [HTML iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)
- [HTML policy inheritance](https://html.spec.whatwg.org/multipage/browsers.html#policy-containers)
- [HTML workers](https://html.spec.whatwg.org/multipage/workers.html#the-workerlocation-interface)
- [CSP fetch and worker restrictions](https://w3c.github.io/webappsec-csp/)
- [CSP WebRTC draft directive](https://w3c.github.io/webappsec-csp/#directive-webrtc)
- [Notifications standard](https://notifications.spec.whatwg.org/)
- [Service worker registration](https://w3c.github.io/ServiceWorker/#dom-serviceworkercontainer-register)

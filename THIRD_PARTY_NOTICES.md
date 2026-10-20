# Bundled rich rendering libraries

`board.html` embeds these pinned npm distributions to work offline as one file.
Regenerate with `npm run embed:rich`; the dependency lock and test command check
that the committed bundles match installed packages. Upstream source is unmodified
except removal of source-map comments and escaping HTML script terminators.

- Marked 18.1.1 — [markedjs/marked](https://github.com/markedjs/marked), MIT;
  full notice in [licenses/marked-MIT.txt](licenses/marked-MIT.txt).
- DOMPurify 3.4.17 — [cure53/DOMPurify](https://github.com/cure53/DOMPurify),
  distributed here under MPL-2.0; full license in
  [licenses/DOMPurify-MPL-2.0.txt](licenses/DOMPurify-MPL-2.0.txt).

Both packages retain their upstream copyright/license headers in the inline
bundles. The viewer's original application code remains under its MIT license.

## Embedded OpenUI report renderer

Regenerate with `npm run embed:openui`. The production build uses a custom
bounded report and form component library and the actual OpenUI renderer. It includes these
locked runtime packages (no hosted observability sink or development inspector):

- react 19.2.4 — MIT; [full notice](licenses/react-MIT.txt).
- scheduler 0.27.0 — MIT; [full notice](licenses/scheduler-MIT.txt).
- react-dom 19.2.4 — MIT; [full notice](licenses/react-dom-MIT.txt).
- @openuidev/lang-core 1.0.1 — MIT; [full notice](licenses/openuidev-lang-core-MIT.txt).
- zod 4.3.6 — MIT; [full notice](licenses/zod-MIT.txt).
- ci-info 4.4.0 — MIT; [full notice](licenses/ci-info-MIT.txt).
- @openuidev/observability 0.0.4 — MIT; [full notice](licenses/openuidev-observability-MIT.txt).
- @openuidev/react-lang 1.0.1 — MIT; [full notice](licenses/openuidev-react-lang-MIT.txt).

The inlined bundle retains upstream legal comments; complete licenses are
provided above. Build tool esbuild is a development dependency, not a runtime
module shipped in the viewer. Install with `npm ci --ignore-scripts`; no package
postinstall hooks are required, including upstream installation telemetry.

Offline adaptation: the bundle builder replaces exactly two unused upstream
`@OpenUrl` sample destinations with `about:blank`, and changes two unused query
prompt descriptions from “fetch” to “load” wording. These are matched complete
prompt strings, not network API rewrites. Runtime source/resource guards remain
unchanged and reject newly introduced networking. Whitespace-only lines in
upstream comments are trimmed; script terminators are escaped for HTML embedding.

## Dracula application palette

Adapted from the [official Dracula palette](https://spec.draculatheme.com/)
by [Dracula Theme](https://draculatheme.com/), MIT, copyright (c) 2023 Dracula Theme.
[Full license](licenses/dracula-MIT.txt); also retained inside `board.html`.
Application surfaces and readable labels are adapted locally; no remote assets.


## Source syntax highlighting

Highlight.js11.12.0 core and15explicit language grammars are bundled offline by
`npm run embed:rich` — [upstream](https://github.com/highlightjs/highlight.js),
BSD-3-Clause; [full notice](licenses/highlightjs-BSD-3-Clause.txt). No language
autodetection, hosted assets or runtime grammar imports are used.

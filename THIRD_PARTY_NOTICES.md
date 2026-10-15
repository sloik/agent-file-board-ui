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

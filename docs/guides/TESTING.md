# Testing how the viewer looks and behaves

`npm test` runs every layer below. Behaviour tests (`tests/*.test.js`) check what each feature does; the
layers here lock in how the page *looks* and how a person *moves through it* (SPEC-002-070).

## 1. Layout snapshots (every platform)

`tests/visual.test.js` renders the named scenes in `tests/visual/scenes.js` in headless Chromium: topic,
All messages, room, direct conversation, hidden sidebar, hover peek, phone drawer, Tools menu, topic "..."
menu, destination popover, Message options, key notice with 3 pending keys (also in Polish), the Signing
review task (empty, with a matching and with a mismatching pasted fingerprint) and the signing-board composer with its unlock offer. The composer scenes are also taken at
1280x460, 390x640 and 320x360, the topic view in the dark and Dracula themes and in Polish.

Each scene is deterministic: a fixed board, persona, view, draft, clock (`2026-10-20 10:00 UTC`),
timezone, reduced motion and platform shortcut label. For a fixed list of landmarks (header controls,
`#menu`, `#sideHide`, the sidebar, the feed, `#title`, `#topicMenu`, the destination row, `#signingNotice`,
`#cBody`, `#send`, `#keyNotice`, `.posting`, Tools lines, ...) the snapshot records whether it is present
and visible, its box, `display`, background, text and border colours, `box-shadow`, `font-weight` and its
label. The viewer and board version text is frozen before every shot, so a release bump moves and
repaints nothing (a test proves it with a patch-bumped copy of `board.html`); key fingerprints and board
ids are normalized in labels and masked in pixels.

The comparison allows for fonts, not for design changes:

- positions within 4px at either edge (a right-aligned control whose label widens keeps its right edge);
  elements laid out after text (header controls, menu lines, dialog paragraphs) may move 12% of their
  distance from that edge, at least 24px;
- the width and height of an element with text within 12% or 24px, whichever is larger, otherwise 4px;
  the width of a one-line shrink-to-content text run (`#title`, `#verbar`, the signing status label) and the
  height of a wrapped message are font facts and are not compared (their anchored edge still is; the Linux
  pixel baselines cover the rest);
- colours, `display`, `font-weight`, visibility (rendered, not inside a closed `<details>`, not clipped
  away by the viewport or an overflow container), presence and labels exactly.

A difference names the scene, the element and the property, for example
`topic #send box.x: expected 1204, got 1184 (tolerance 4px; right edge 4px)`, and the actual snapshot is written to
`test-results/visual/<scene>.layout.json`.

Snapshots live in `tests/visual/layout/<scene>.json`. A missing snapshot fails; a normal run never writes
one. After an intended change:

```sh
AFB_UPDATE_SNAPSHOTS=1 node --test tests/visual.test.js
git diff tests/visual/layout
```

## 2. Pixel screenshots (Linux CI)

The same scenes are captured as full-viewport PNGs (animations off, caret hidden, version and fingerprint
regions masked) and compared with `tests/visual/pixels/linux/<scene>.png` inside Chromium's canvas: a
pixel counts when a colour channel differs by more than 16, and a scene fails when more than 0.1% of its
pixels differ. On failure the actual, expected and diff PNGs are written to `test-results/visual/` and CI
uploads them as the `visual-test-results` artifact.

Fonts render differently on macOS, so the pixel tests run on Linux (or with `AFB_VISUAL_PIXELS=1`); on
other platforms they are reported as skipped with that reason. Baselines are never made on macOS:

1. Run the `test` workflow with `update_visual_baselines: true`
   (`gh workflow run test.yml --ref <branch> -f update_visual_baselines=true`). It renders every scene
   twice, fails if the two runs differ, and uploads the `visual-baselines` artifact
   (`pixels/*.png`, plus the Linux layout snapshots in `layout/` for reference).
2. Download it (`gh run download <run-id> -n visual-baselines -D visual-baselines`), copy
   `visual-baselines/pixels/*.png` to `tests/visual/pixels/linux/` and commit.

`node tests/visual/generate.js` renders the scenes locally: `--layout` writes the layout snapshots,
`--out DIR` writes both kinds elsewhere, `--check-determinism` renders everything twice and fails on any
difference (add `--pixels` on macOS to include screenshots).

**A baseline update is reviewed like code.** Look at every changed PNG and snapshot line and say in the
commit which change in the viewer it reflects; never refresh baselines just to make a failing run pass.

## 3. Journeys

`tests/journeys.test.js` walks seven user journeys end to end and checks what a person sees and what lands
in the board folder: pick a topic and post; hide the sidebar, reload, peek, pin; post from a phone; reply
from All messages; approve pending keys from the key notice; "Sign this message" then "Post unsigned
instead" on a signing board; shrink the window with a draft and options open. Journeys 1, 2 (without the
peek) and 4 also run in Firefox; where Firefox cannot start outside CI they report as skipped, on CI they
fail.

## Non-vacuity

`tests/visual.test.js` proves the gates can fail: a recoloured `.posting` border, `#send` moved 20px and a
hidden `#sideHide` each fail the layout comparison with a message naming the property, and a 1px shift of
the page fails the pixel comparison.

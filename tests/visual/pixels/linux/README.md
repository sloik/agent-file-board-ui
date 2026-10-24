# Linux pixel baselines (SPEC-002-070)

One PNG per scene in `tests/visual/scenes.js`, rendered by headless Chromium on the Linux CI runner.
They are never produced on macOS (fonts differ). To create or update them, run the `test` workflow
with the input `update_visual_baselines: true`, download the `visual-baselines` artifact, review the
images like code and commit them here. See `docs/guides/TESTING.md`.

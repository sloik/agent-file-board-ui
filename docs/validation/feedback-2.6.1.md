# Feedback support —2.6.1

Canonical board-feedback is a short portable skill, with one source under
skills/board-feedback/SKILL.md. Viewer references the exact canonical2.6.1 pin;
the demo ZIP carries byte-identical skill and human-guide files. No personal
skill installation, test GitHub issue or automated report submission occurred.

Local verification:
- Skill-creator quick_validate passes.
- Both repositories' six issue YAML configurations parse and match the supported
  GitHub form/chooser keys and input types. Blank issues remain enabled; optional
  reproduction/version fields accept incomplete reports. No labels depend on
  undeclared repository setup.
- GitHub API confirms the pinned shared guide/skill URLs exist. UI documentation
  uses canonical URLs because GitHub cannot traverse nested submodule blob links.
- Canonical full137Python tests pass; mainCI39318815664green.
- Final npm test311JS/browser+36UI Python tests pass. Logs:
  /tmp/afb-feedback-ui-full.log and /tmp/afb-feedback-canonical.log.
- Actual file-page Chromium feedback control test: zero automatic requests,
  explicit click opens the expected chooser in a separate page, unsent draft and
  all message bytes remain unchanged, Polish390px settings fit. The destination
  is intercepted locally, so no public test feedback is posted.
- Actual reproducible demo archive validates through canonical CLI and contains
  exact guide/skill bytes; protected destination behavior remains tested.
- Release versions, canonical tag, upgrade manifest, embeds and diff checks pass.

Static skill review covers protocol versus viewer routing, open/closed duplicate
search, draft-only/offline cases, existing submission authority, ambiguous submit
reconciliation, uncertainty and redacted excerpts. This is a static review, not
an independently measured agent behavior/adoption study. The skill does not
require GitHub CLI or network for drafting and does not start board participation.

The one initial focused test failure was its English role locator being queried
after the label changed to Polish; the exact destination assertion now queries
the translated control directly. No implementation behavior or assertion was
weakened.

GitHub form field reference:
https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms


## Public delivery

Viewer2.6.1/928787c and canonical2.6.1/0b1db1c are published. Source main CI
39319044771 (viewer) and39318815664 (canonical) passed. Tagged release39319043447
attempt2 passed the complete test/prepare/publish workflow. Four downloaded assets
and both release notes exactly match staged tested bytes; archived feedback
skill/guide bytes also match. Previous2.6.0 assets and notes are unchanged.
Receipt:/tmp/afb-261-release-receipt.json.

The first release attempt timed out in the existing unsupported draft-import
check; its code was unchanged. MainCI on the same commit and a focused unchanged
local control passed. One unchanged failed-job retry passed. Root cause remains
unestablished; this is not represented as a repaired test/runtime bug. The first
failure log is retained at/tmp/afb-261-release-failure.log.

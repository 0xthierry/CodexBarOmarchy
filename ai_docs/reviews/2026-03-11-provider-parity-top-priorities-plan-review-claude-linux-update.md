# Provider Parity Top Priorities Plan — Plan Review

## Artifact Reviewed

- Plan: `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md`
- Review mode: `Mode C`
- Repository context: `CodexBarOmarchy` working tree on 2026-03-11
- Related ticket / request: update the parity plan after the Linux Claude browser-cookie spike

## Verdict

`READY`

## Inferred Intent

- The plan is trying to define an implementation-ready path for the current top-priority parity gaps in this repo.
- Accepted exclusions remain tray / Waybar work, new providers, and a broader widget/export system.
- The primary execution shape is:
  - replace the flat runtime snapshot with a richer provider-specific model
  - add a shared Linux browser-cookie import layer for Codex and Claude
  - layer provider-specific Codex and Claude web enrichment on top of that
  - add token-cost, pace, and Gemini drill-down support into the new model and TUI

## Lens Coverage

| Lens | Ran? | Why | Summary |
| --- | --- | --- | --- |
| routing-and-coverage | yes | mandatory | Mode C was available because the plan, repo, and current user direction were all available. |
| intent-and-contract | yes | mandatory | The updated plan preserves the user’s narrowed priorities and now explicitly includes the Claude Linux browser-cookie outcome they requested. |
| repo-grounding-and-accuracy | yes | mandatory | Referenced runtime files and the validated Linux spike results match the current repo and local investigation. |
| acceptance-and-verifiability | yes | mandatory | Acceptance criteria are specific enough to drive implementation and tests, with the Claude org-selection ambiguity now closed for the first slice. |
| slicing-and-sequencing | yes | mandatory | The sequence now puts shared browser-cookie infrastructure before provider-specific web work, which matches the validated implementation dependency. |
| simplicity-and-scope-control | yes | mandatory | The plan avoids duplicating browser-cookie logic per provider and keeps follow-up items like purchase URL and Claude org switching out of the first slice. |
| risk-rollout-and-compatibility | yes | mandatory | The plan reflects the explicit no-backward-compatibility decision and calls out Linux browser-specific risks, secret-store dependence, and graceful degradation. |
| handoff-and-execution-readiness | yes | mandatory | Another implementer can start without re-deriving the Linux path or the provider split. |
| data-schema-and-migration | yes | runtime-state contract changes | The runtime-model replacement is scoped clearly enough for a coordinated migration of stats and TUI consumers. |
| api-consumer-and-ux-impact | yes | stats and TUI contract changes | Stats/TUI consumer changes are explicitly included and the plan keeps user-visible fallback behavior defined. |
| security-and-reliability | yes | cookies, tokens, secret-store, auth flows | The plan keeps manual fallback, uses validation steps before enrichment, and does not treat failed web import as fatal to provider refresh. |
| performance-scale-and-concurrency | yes | local scans plus parallel refresh work | The plan keeps caching out of the first token-cost slice unless measurement justifies it, which is a reasonable constraint. |

## Blockers

- None

## Major Improvements

- None

## Minor Notes

- The Linux browser validations are still from one machine and account shape.
  - Evidence: the Codex and Claude spike conclusions referenced by the plan are explicitly local-machine validations.
  - Why it matters: implementation should keep unsupported browser/profile shapes behind graceful fallback rather than assuming universal success.

## What the Plan Gets Right

- It now treats Linux browser-cookie import as shared infrastructure instead of duplicating risky Chromium/Firefox logic per provider.
- It correctly distinguishes the Codex and Claude downstream fetch shapes:
  - Codex requires `api/auth/session` plus `backend-api/wham/...`
  - Claude can use `sessionKey` directly with `claude.ai/api/...`
- It preserves the explicit no-backward-compatibility decision and updates all current consumers in the same runtime-model slice.
- It closes the main Claude ambiguity by defining the first-slice org-selection rule instead of leaving that choice to the implementer.

## Suggested Edits

1. Keep the implementation notes in `session.md` synchronized as soon as work starts on the shared browser-cookie layer, because that layer is now a dependency for two providers.
2. When implementation begins, add fixture-backed tests for Chromium DB version-24 digest stripping and for the Claude `email_address` response key to prevent regressions from the exact payload shapes seen in the spike.

## Lead Judgment

Implementation can begin from this plan now.

The remaining uncertainty is operational breadth, not plan readiness: browser/session behavior outside the validated local setups may still differ, but the plan already treats those differences as graceful-degradation cases rather than hidden scope.

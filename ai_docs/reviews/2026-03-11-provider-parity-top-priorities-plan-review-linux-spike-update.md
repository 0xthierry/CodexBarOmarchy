# Plan Review: Provider Parity Top Priorities (Linux Spike Update)

Date: 2026-03-11
Plan: `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md`
Review mode: Mode C (`plan + repository + original request context`)

## Intent

Review whether the updated parity plan is now implementation-ready after the Linux Codex web-extras spike validated browser cookie extraction and `backend-api/wham` access.

## Lenses run

- routing-and-coverage
- intent-and-contract
- repo-grounding-and-accuracy
- acceptance-and-verifiability
- slicing-and-sequencing
- simplicity-and-scope-control
- risk-rollout-and-compatibility
- handoff-and-execution-readiness
- security-and-reliability

## Findings

### Blockers

None.

### Major improvements

None.

### Minor notes

- The plan now correctly removes the stale `manual`-first recommendation and reflects the validated Linux flow:
  - browser session acquisition
  - `api/auth/session`
  - bearer token + account id
  - `backend-api/wham`
- The plan correctly keeps `manual` cookie mode as a fallback rather than the primary path.
- The plan is appropriately conservative about purchase URL, which is still not validated from the Linux spike.

## Repo grounding check

Confirmed against current repository artifacts:

- Linux spike notes in `spike.md`
- working-session notes in `session.md`
- experimental browser validation script in `skipe/codex-openai-linux-spike.ts`
- existing Codex config/runtime seams in:
  - `src/core/providers/codex.ts`
  - `src/runtime/providers/codex.ts`

The updated plan is materially aligned with the validated repo evidence.

## Acceptance criteria review

The Codex web-extras ACs are now substantially stronger:

- they describe the Linux auto-cookie acquisition path
- they preserve primary-source safety
- they explicitly allow purchase URL omission in the first slice if it remains unsupported by the validated API path

The remaining AC set for token-cost, pace, and Gemini remains unchanged and still reads as implementable.

## Sequencing review

The phase order remains reasonable:

1. runtime model
2. machine-readable pace inputs
3. pace
4. token-cost history
5. Codex web extras
6. Gemini drill-down
7. stats/TUI expansion

This is still a workable sequence even after the Linux spike. The spike lowers uncertainty for phase 5 but does not force a reorder.

## Readiness verdict

`READY`

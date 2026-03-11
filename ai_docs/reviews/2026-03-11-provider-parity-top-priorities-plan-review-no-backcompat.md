# Provider Parity Top Priorities Plan Review (No Backward Compatibility)

## Artifact Reviewed

- Plan: `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md`
- Review mode: `Mode C`
- Additional user clarification: backward compatibility is not required for this work
- Context: current repository, `session.md`, and upstream `CodexBar` reference docs

## Verdict

`REVISE`

## Inferred Intent

The plan is meant to guide the next parity-focused implementation slice for the existing runtime and TUI, covering:

- richer provider-specific runtime data
- Codex dashboard extras
- token-cost history
- pace
- Gemini drill-down

Under the new clarification, the plan should optimize for a clean replacement of the current runtime model where useful, not for preserving old snapshot consumers.

## Lens Coverage

| Lens | Ran? | Summary |
| --- | --- | --- |
| routing-and-coverage | yes | The plan still covers the right five priority areas. |
| intent-and-contract | yes | The main issue is that the plan is no longer aligned with the clarified “no backward compatibility” requirement. |
| repo-grounding-and-accuracy | yes | File grounding is still solid. |
| acceptance-and-verifiability | yes | Most ACs are workable, but some are anchored to a compatibility goal that is no longer required. |
| slicing-and-sequencing | yes | The dependency order is mostly good, but the migration shape should be simplified. |
| simplicity-and-scope-control | yes | The current plan is more conservative than necessary under the new requirement. |
| risk-rollout-and-compatibility | yes | Compatibility risk can now be reduced by deleting migration constraints rather than preserving them. |
| handoff-and-execution-readiness | yes | Another implementer still needs a revised plan before implementation starts. |

## Blockers

- **[blocker][high][intent-and-contract]** The plan still treats backward compatibility as a requirement even though the user has now explicitly removed that constraint.
  - Evidence:
    - the runtime-model section says to “keep the current shared snapshot intact for backward compatibility”
    - it adds a “Backward-compatibility requirement”
    - `AC-01` requires the current shared snapshot contract to remain available and existing tests to keep passing after the extension subtree is added
  - Why it matters:
    - this changes the architecture and migration strategy
    - it pushes the plan toward an additive compatibility layer when a cleaner replacement is now allowed
    - it may preserve fields like `metrics` and current `usage.displayMetrics` longer than necessary

- **[blocker][medium][intent-and-contract]** The Codex dashboard acquisition strategy is still a proposal, not a confirmed scope decision.
  - Evidence: the plan still frames manual-cookie-first as a proposal.
  - Why it matters: this is still a real scope choice for the first Codex dashboard slice.

## Major Improvements

- **[major][high][slicing-and-sequencing]** The runtime-model phase should be rewritten as a coordinated replacement phase, not a backward-compatible extension phase.
  - Suggested revision:
    - replace `ProviderRuntimeSnapshot` with the richer structured model in one planned migration
    - update all current consumers in the same slice:
      - `src/runtime/providers/*`
      - `src/cli/stats-output.ts`
      - `src/ui/tui/presenter.ts`
      - relevant tests
    - remove compatibility-specific ACs and migration language

- **[major][medium][simplicity-and-scope-control]** The plan should explicitly state which old fields can be deleted or redefined.
  - Example candidates:
    - `metrics` compatibility duplication in stats output
    - the current over-reliance on `usage.displayMetrics` as the primary machine-readable contract
  - Why it matters: without this, an implementer may still preserve legacy fields by habit.

- **[major][medium][acceptance-and-verifiability]** The acceptance criteria should shift from “old contract still works” to “new structured model fully powers current surfaces.”
  - Better target:
    - `bun run stats` exports the new model
    - the TUI renders from the new model
    - tests are updated to the new model rather than guarding the old one

## Minor Notes

- The sequencing of pace before Codex dashboard extras still makes sense even without compatibility constraints.
- The Gemini drill-down section is still well-scoped and does not depend on the compatibility decision.
- Token-cost cache policy is still open, but it can be treated as an explicit first-slice simplification if accepted.

## Strengths

- The plan remains well-grounded in the current repo and upstream reference seams.
- The chosen priorities still make sense in the current order.
- The Codex dashboard failure-isolation rule is still correct and should remain in the revised plan.

## Suggested Edits Before Treating The Plan As Final

1. Remove backward-compatibility language and compatibility-driven ACs from the runtime-model section.
2. Rewrite the runtime-model phase as a clean replacement of the current snapshot shape with coordinated consumer updates.
3. State explicitly which current compatibility-oriented fields may be removed or redefined.
4. Confirm the remaining Codex dashboard acquisition decision:
   - manual-cookie-first, or
   - manual + auto in the first slice.

## Lead Judgment

With the new clarification, the plan is too conservative. The right revision is not to preserve the old runtime contract; it is to replace it cleanly and update the current consumers in one controlled slice.

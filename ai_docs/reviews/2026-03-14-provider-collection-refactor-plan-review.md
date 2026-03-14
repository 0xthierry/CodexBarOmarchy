# Provider Collection Refactor Plan — Plan Review

## Artifact Reviewed

- Plan: [ai_docs/plans/2026-03-14-provider-collection-refactor.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/ai_docs/plans/2026-03-14-provider-collection-refactor.md)
- Review mode: `Mode C`
- Repository context: current checkout on 2026-03-14
- Related request: refactor the collection/parsing side of the provider runtime, save the Oracle output, and produce a plan for discussion

## Verdict

`READY`

## Inferred Intent

Briefly restate:

- the problem the plan is trying to solve
  - Refactor the provider collection/runtime layer so source resolution, collection, parsing, normalization, snapshot assembly, and enrichment are separated into clearer seams.
- the accepted non-goals or exclusions
  - No provider-parity expansion, no new provider sources, no generic base adapter or generic parser framework, and no packaging/tray/release work.
- the primary execution shape
  1. Extract enrichers and narrow shared helpers.
  2. Replace enum-only source resolution with richer source handles.
  3. Split provider collectors into source-local modules.
  4. Centralize snapshot/result wiring.
  5. Remove the percent-string metric roundtrip.

## Lens Coverage

| Lens | Ran? | Why | Summary |
| --- | --- | --- | --- |
| routing-and-coverage | yes | mandatory | Mode C was available because the plan, repo, and clarified user intent were all present. |
| intent-and-contract | yes | mandatory | The plan matches the user’s requested refactor focus and preserved the agreed scope boundaries. |
| repo-grounding-and-accuracy | yes | mandatory | Referenced files, tests, and current runtime boundaries match the repo. |
| acceptance-and-verifiability | yes | mandatory | Most ACs are testable, but one contract remains too ambiguous for another implementer to execute confidently. |
| slicing-and-sequencing | yes | mandatory | Phase order is coherent and keeps the highest-risk contract change late. |
| simplicity-and-scope-control | yes | mandatory | The plan avoids overreaching into a base framework or unrelated app work. |
| risk-rollout-and-compatibility | yes | mandatory | The plan recognizes consumer-contract and fallback-diagnostic risk, but one compatibility detail still needs to be pinned down. |
| handoff-and-execution-readiness | yes | mandatory | The draft is close, but another implementer would still need one architecture decision confirmed instead of inferred. |
| data-schema-and-migration | yes | triggered by runtime-state contract changes | No external migration exists, but the runtime snapshot contract changes need a clearer internal target. |
| api-consumer-and-ux-impact | yes | triggered by stats/TUI contract impact | The plan correctly notes consumer touch points. |
| security-and-reliability | no | not primary | No new trust boundary or secret handling design is being introduced. |
| performance-scale-and-concurrency | no | not primary | The plan does not materially alter scheduling or concurrency semantics. |

## Blockers

- None

## Major Improvements

- None

## Minor Notes

- The plan correctly names likely downstream consumers, but [src/ui/tui/provider-details-presentation.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/ui/tui/provider-details-presentation.ts) and [src/ui/tui/runtime-formatters.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/ui/tui/runtime-formatters.ts) may also need updates or validation once the metric contract moves formatting later.
- `AC-08` is useful, but “materially reduced to a narrow facade” is somewhat subjective. That is acceptable for a `Should`, but not strong enough for a `Must`.

## What the Plan Gets Right

- It is grounded in the actual runtime/provider files, current tests, and the saved Oracle note.
- It keeps the refactor inside the intended runtime collection surface and explicitly rejects overengineering such as a base adapter or universal parser framework.
- It sequences the riskiest contract change, the metric roundtrip removal, after structural extraction work.
- It correctly identifies Claude as the highest-risk provider while still recommending Gemini as the cleanest first proof for the normalized seed path.

## Suggested Edits

1. Add a short note that the metric-contract phase may require validating `provider-details` and formatter paths in addition to presenter and stats snapshots.

## Lead Judgment

Implementation can begin from this plan.

The only remaining note before coding is to keep downstream formatter/detail validation visible during the metric-contract phase.

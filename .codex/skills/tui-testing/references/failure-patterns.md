# Failure Patterns

## PTY and Non-TTY Paths Diverge

Symptom:
- The plain command prints a clean snapshot, but the live TTY behaves differently.

Check:
- Read the entrypoint and confirm there is an `isTTY` split.
- Validate both paths independently.

Do not:
- Claim the interactive path works because the snapshot path works.

## ANSI Noise Obscures State

Symptom:
- Output is full of escape codes and it is unclear whether the screen updated.

Check:
- Poll again after a short delay instead of interpreting a single noisy frame.
- Look for concrete text changes, not just movement in the buffer.

## Bulk Input Hides the Real Problem

Symptom:
- A long multi-key write seems to do nothing or leaves the UI in an unclear state.

Check:
- Resend the flow in small steps with polls between them.
- Separate text entry, focus changes, and submit keys.

This mattered in CodexBarOmarchy: staged writes made it clear whether a Claude token-account edit was failing in the terminal transport or in the application logic.

## Modal Suppression Looks Like Broken Shortcuts

Symptom:
- Digit or navigation shortcuts stop working while a modal is open.

Check:
- Read the controller. The suppression may be intentional.

Do not:
- Report this as a bug unless the design or tests say otherwise.

## On-Screen Success Does Not Prove Persistence

Symptom:
- Footer or modal text says the change was saved, but the actual config may still be unchanged.

Check:
- Read the persisted file or store after the action.
- Confirm both the saved value and any dependent index or selection fields.

## Manual Pass Pollutes Real User State

Symptom:
- Temporary accounts, toggles, or selected providers remain after the test.

Check:
- Restore the backed-up file.
- Re-read the file after restore to prove cleanup succeeded.

Do not:
- Assume closing the app rolled back the change.

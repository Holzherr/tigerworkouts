Status: TW-025 — the big button's job, awaiting Nick's OK on the proposal below

# Timer controls: the big button follows the step

Nick, iOS app, 2026-09-30: "Done is biggest button while on workout. Pause / start should be. Done
is very secondary and is expected it in top right menu. What is difference between pause and skip?"

## What is there now

`TimerView.controls` (iOS) and `timer-screen.tsx` (web): a row of Back, Pause/Resume, Skip, then a
full-width coral **Done** (**Done early** on a countdown).

- **Done** (`runner.done()`): this step is finished. Logs it (a timed step logs the time it ran),
  checks for a record and moves on. It is not "finish the workout".
- **Skip** (`runner.skip()`): moves on without doing the step; it is marked skipped and can be undone.
- **Pause**: stops the clock where it is.
- Ending the session: the X at the top left → "Finish and save" / "Discard".

The label "Done" reads as "end the workout", which Nick expects in a top-right menu.

## Proposed

- **Countdown step** (timed work, rest, lead-in): the big button is **Pause / Resume**. The step
  ends by itself; "Done early" moves into the small row beside Back and Skip.
- **Rep or set step** (no countdown, nothing to pause): the big button is **Set done**, saying which
  one ("Set 2 of 4 done"), since tapping it is the only way forward. Pause goes to the small row.
- **Skip** keeps its place in the small row, with the words "Skip this step" for VoiceOver.
- **Finish workout** moves to a ⋯ menu at the top right (Finish and save, Discard); the X stays as
  the way out, asking the same question.
- Same on the web timer.

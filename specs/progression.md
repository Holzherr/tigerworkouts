Status: built

# Today's targets and stalls

Asked for 27 Sep 2026, from the Hevy gap list (item 8) and the product review: connect timed work to
progression by density — more rounds or reps in the same window, which the timer already measures
— detect a stall from history, and treat the weights you own as a hard constraint. No identity
metric, no chatbot, nothing that costs you for ignoring it.

## Rules

- **Density.** A workout scored on rounds, time or total reps gets a target from its last three
  scores: "Aim for 8+ rounds" (best of the three), "Finish in under 11:40" (best finished time).
  A stopped for-time run does not count.
- **Load × reps.** Reps are banked at the current load, a rep a set, up to the top of the range —
  or, with no range, to the reps at this load that equal the prescribed reps at the next load up
  (Epley, capped at double). Then the load goes up one step of the exercise (`step`: 4 kg on a
  kettlebell), back to the bottom of the range. Steps moved by a programme's own progression rules,
  per-set plans and loads relative to a training max or bodyweight are left to `nextLoads`.
- **Intent.** Settings → Suggestions: Restore (match), Maintain (default: a rep or round more),
  Overreach (two more, a faster time).
- **Stall.** The session that set the standing best plus at least three after it, over at least
  three weeks, the newest within four weeks. Exactly two options. Bodyweight reps that never vary
  (a circuit's prescribed count) are not a stall.

## Where it shows

Up next card (Today line, one stall line), top of the workout page (targets, workout stall), the
timer (a pill beside the race against last time), the finish screen's "Next time", the exercise
logbook (stall card). A dismissed stall stays dismissed until a new best starts a new one. Never a
notification.

Code: `src/features/runsheet/targets.ts`, `src/features/results/stall.ts`, ported to
`ios/TigerWorkouts/Model/Targets.swift` and `ios/TigerWorkouts/Results/Stall.swift`.

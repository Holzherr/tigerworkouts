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
- **Mode** (Priyanka via Nick, 15 Nov 2026). How a lift moves on, per account (Me → Settings →
  Progress by) with a per-exercise override (the exercise's page):
  - **Reps** (the default, as above): bank reps to the ceiling, then a load step and back to the bottom.
  - **Weight**: the plan's reps on every set; one load step (two on Overreach), snapped to the kit,
    once every working set made them, else hold the weight.
  - **Effort**: the same weight and reps as last time; one load step at the same reps once the hardest
    working set's RPE was 7 or less (8 on Overreach). RPE is per set (`SetResult.rpe`, optional),
    asked on the finish screen ("How hard was each lift?") only for lifts in effort mode. A
    bodyweight lift in effort mode gets a rep more a set instead.
- **Off.** Suggestions can be switched off for the account (Me → Settings → Suggest progress) or
  for one workout (its Week by week page). Off means no Today line, no target on the timer, no Next
  time, no stall cards. Restore/Maintain/Overreach stays as it was.
- **Setup question.** Once per account, on the first workout page with a loaded lift: "Want
  suggestions on how to progress?" Yes → "Progress by reps, weight or effort?"; No turns them off.
  Changeable later in Settings.
- **Stored** on `user_state.prefs.suggestions` (`{ off?, mode?, asked?, exercises?: {key: mode},
  offWorkouts?: [id] }`), synced like `equipment`. The web carries it through untouched and keeps
  its stamp; the web's targets take a `mode` (ported, tested) but the web has no picker yet and
  always uses reps.
- **Last time, set by set** (Priyanka via Nick, 15 Nov 2026). Targets read the last session's working
  sets in order. Straight sets (one load) get a target; sets at different loads (ramping, a pyramid,
  100 × 8 then 110 × 4, an odd 115 × 1 at the end) get none, as the timer gives a pyramid none and
  starts each set on last time's. The heaviest set is never taken for the working weight.
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

## Week by week

A workout page's "Week by week" row opens a table: a row per exercise and set, a column per session
(Wk 1, Wk 2…, weeks counted from the first session), each cell what was logged ("100 × 8") with the
change since the column before ("+5 kg", "+1 rep"; coral when heavier or more reps), the newest
column highlighted. Columns cover the workout, the original of an edited copy, and every workout
linked by ⋯ Duplicate (`duplicatedFrom` on the copy, iOS). A tap on an exercise opens its history
across every workout, with the chart. iOS only so far. Code: `ios/TigerWorkouts/Results/WeekTable.swift`,
`Features/ProgressTableView.swift`.

Code: `src/features/runsheet/targets.ts`, `src/features/results/stall.ts`, ported to
`ios/TigerWorkouts/Model/Targets.swift` and `ios/TigerWorkouts/Results/Stall.swift`.

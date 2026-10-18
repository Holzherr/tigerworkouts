Status: built

# Timed and distance work, round times, editing logged sets

Asked for 28 Sep 2026, from the Hevy gap list (ranked items 2 and 9, and "set times and round
splits are saved but shown nowhere").

## Logging

- A logged set (`SetResult`) has optional `seconds`, `meters` and `calories` next to reps, load,
  `at` and type. Old rows have none of them and read as before.
- `seconds` is the time worked: a countdown for as long as it ran (Done early keeps the real time,
  Skip logs nothing), a max effort, a distance or a calorie step for as long as it took. A set of
  reps keeps no time, nor does a set ticked the moment its rest ended.
- A distance or calorie step logs the plan unless changed with the stepper on the timer card or in
  the set grid. A timed step logs only its time, unless its `log` asks for more (18 Oct 2026, see
  "What a step logs").
- An exercise counted in metres, seconds or calories (`unit` m, s, cal) logs no load: its unit is
  the measure. The timer hides its load stepper.
- Timed work ends with Done early on the timer; Skip is in the ⋯ menu (web).

## What a step logs (18 Oct 2026)

- A step has a target (`forMode` + `forValue`, a load) and an optional `log`: reps, meters or
  calories, recorded after each set. Unset logs nothing beyond the target; finishing is the result.
- The timer asks for reps when the step is done to a count (reps, reps-plus, max) or logs reps; for
  metres or calories when it is done for a distance or calories (the plan, changed if need be) or
  logs them. Never from the exercise alone: a 30 s rower step asks for nothing unless set to log
  metres. `countsReps` / `amountOf` in model.ts, `countsReps` / `amountLog` in RunsheetMath.swift.
- The editor has no log row by default. Add to log offers what the target does not record already
  (no reps on a reps step, no metres on a distance step); the row it adds comes off with its ✕.
- The set grid gives a logged measure its own column next to the count; Edit sets on a session offers
  the columns the step logs. MCP: create/update_workout take `log`; list_sessions returns `sets`.

## Records and the logbook

- New logbook kinds: pace (distance with a time), distance, calories, time. Records: fastest time
  per distance, furthest, most calories, longest hold. PR marks and the finish screen use them.
- The chart plots the best per session: pace per 500 m on a rower or ski erg and per km otherwise
  (faster is up), most metres, most calories, longest hold.
- Fastest round of a workout, per block, from the splits: a record on the finish screen when beaten.
- Stalls and targets stay on load and reps.

## Round times and set times

- Session detail and the finish screen show each round's time per block, the fastest and slowest
  marked, and each round against the same round last time. Since 18 Oct 2026 only where the round
  time varied: a rounds or EMOM block whose every exercise is on the clock has no round times (and no
  fastest-round record); fastest/slowest are marked only ≥ 5 s and ≥ 5% apart. Such a block shows
  what each round logged instead, when its steps log an amount, the most marked "best". No block
  qualifies, no section. Session detail lists every set with
  what it measured and when in the session it was ticked.

## Editing logged sets

- Session detail → Edit sets: load, reps, metres, calories, seconds and type per set. The row's
  `target` and `reps` are worked out again from the sets, so the logbook, records, targets, stalls
  and next session's loads read the edit. Synced as any session edit.
- The web result sheet's load stepper now moves the sets' loads too.

## CSV

- Export gains `seconds`, `meters`, `calories` columns. Hevy (`duration_seconds`, `distance_km` or
  `distance_miles`) and Strong (`Seconds`, `Distance` in its unit, km when unsaid) import into them.

Code: `runner.ts` / `Runner.swift`, `logbook.ts` / `Logbook.swift`, `rounds.ts` / `Rounds.swift`,
`edit-sets.ts` / `EditSets.swift`, `csv.ts` / `CSV.swift`.

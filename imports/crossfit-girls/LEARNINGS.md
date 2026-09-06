# CrossFit Girls — import learnings

## Source
- crossfit.com has a canonical page per Girl at `https://www.crossfit.com/benchmark/<slug>` (36 of them resolve; `/workout/the-girls` and `/benchmarks` 404). Older pages show `Rx'd / Intermediate / Beginner` with ♀/♂ loads; the 2021 "new Girls" pages show only `RX'D Workout`. Missing pages return HTTP 200 with a "NO REP" 404 body, so check content not status.
- Plain `curl -A Mozilla` works; no rate limiting seen over ~40 requests.
- wodwell.com renders its prescriptions client-side; WebFetch gets only the shell, so cross-checking used sandandsteelfitness.com, wodtimecalculator.com and the CrossFit Journal PDFs (`library.crossfit.com/free/pdf/13_03_Benchmark_Workouts.pdf`, `27_04_new_girls.pdf`).
- Nasty Girls V2 has no benchmark page; source is the 2014-05-01 WOD. Megan has no crossfit.com page at all (wodwell/community lists only).
- Not imported: Jenny (a Hero WOD, not a Girl), Naughty Nancy (2013 Games event), Cindy XXX / Double Grace / Isa-Grace (community variants, no official page).

## Modelling
- Rep ladders: one `fortime` block per rung. Linda and Lyla become 10 blocks each (Linda = 30 exercise steps); fine for the validator, verbose in the UI.
- Rounds with prescribed rest (Barbara, Barbara Ann) carry a rest step inside the block; the source excludes the final rest from the score — noted, not modelled.
- Barbara / Barbara Ann are "5 rounds, each for time" (score = sum of work intervals); modelled as one `fortime` block `repeat 5`.
- Bodyweight-relative loads (Linda 1.5×/1×/0.75× BW, Lynne BW bench, Lane 0.75× BW, Lyla BW C&J): no `target`, multiplier in `note`. A `loadFactor` (× bodyweight) field on ExerciseStep would fix this.
- Max-rep sets (Lynne, Lane, Nicole's pull-ups): `forValue` must be > 0, so `forValue: 1` with a "max reps" note. Needs a `forMode: "max"` (score = reps).
- "For load" (Gwen): score is the weight, not time. Modelled as a `rounds` block with 15/12/9 rep steps and "rest as needed" rests; needs a block score type (`time | reps | load | rounds`).
- "Rest as needed" (Gwen, Lynne, Lane) has no representation; used 180 s rests with a note.
- Hope (Fight Gone Bad format): 60-second max-rep stations, `forMode: seconds`, block `mode: rounds` repeat 3 with 60 s rest. Score = total reps, same missing score type.
- Chelsea: `emom` repeat 30 everySec 60. The "if you fall behind, keep going and count rounds" rule is only a note.
- Nicole: AMRAP whose score is total pull-ups, not rounds.
- Marguerita: 50 rounds of 1 rep × 5 movements; `repeat: 50` works but the timer estimate (3 s/rep) is far too optimistic for handstands and burpees.
- Kettlebell loads use the actual bell sizes (24/16 kg, 32/24 kg) rather than the strict lb→kg rounding (which would give 24/16 and 32.5/24.5), because 53/35 lb and 2/1.5 pood are 24/16 and 32/24 kg bells in practice.
- Barbell loads converted lb→kg ÷2.2046 to 0.5: 95/65 → 43/29.5, 135/95 → 61/43, 225/155 → 102/70.5, 45/35 → 20.5/16, 65/45 → 29.5/20.5, 75/55 → 34/25, 175/125 → 79.5/56.5. Real-world kg plates would make these 43/30, 61/43, 102/70; consider a "snap to plates" display.
- Box height (24/20 in) and wall-ball target height (10/9 ft) have no field; both in `note`.
- `db_snatch` is a single dumbbell (unit `kg`); `db_thruster` in the library is `kg per arm` — Ellen uses both with the same 22.5 kg value.
- Cleans in Elizabeth are "cleans" on crossfit.com (squat clean intended per the Journal); Linda's page says "squat cleans". Both use `bb_squat_clean`.
- Nasty Girls and Hope only give a men's load on crossfit.com; women's Rx (95 lb, 55 lb) comes from crossfit.com WOD reposts / common practice, flagged in `note`.

## App additions worth making
- `forMode: "max"` for max-rep sets; block-level `score` (`time | rounds | reps | load`).
- `loadFactor` (× bodyweight) as an alternative to `target`.
- Rest step `asNeeded: true`.
- Per-exercise metadata for box height / target height (or a generic `variant` string shown in the UI).
- Group `gym` is accepted by the validator but not in `ExerciseGroup` / `GROUP_LABEL` in `library.ts` — add it before merging these exercises.

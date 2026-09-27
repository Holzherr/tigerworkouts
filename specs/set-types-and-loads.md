Status: built

# Set types, the weights you own, relative loads

Asked for 27 Sep 2026, from the Hevy gap list (items 9, 12, 13) and a known bug.

## Set types

- A set is normal, warm-up, drop set or to failure: `type` on a planned set (`SetPlan`) and on a
  logged one (`SetResult`); unset means normal. Written as `normal`, `warmup`, `drop`, `failure`.
- The set grid (editor and timer) shows W for a warm-up, D for a drop set, F for to failure, and
  numbers the normal sets. A drop set is part of the set before it, so it gets no number. A tap on
  the set number goes 1 → W → D → F → 1.
- Warm-ups are left out of records and PRs, volume and tonnage, the chart's best, stalls and
  targets. Drop sets are left out of targets and the effort set count. The old `target` and `reps`
  fields on a logged row leave warm-ups out too.
- No rest before a drop set: the timer goes straight on from the set before it.
- CSV export has a `set_type` column (Hevy's words: normal, warmup, dropset, failure); Hevy and
  TigerWorkouts imports read it.

## The weights you own

- Settings → My equipment: bar weight, plate counts, dumbbells, kettlebells. Synced on
  `user_state.prefs.equipment`.
- Suggested loads snap to what these can make: progression rules (`nextLoads`), today's targets,
  a converted swap, a % of a training max. A kit left unset is no constraint, except kettlebells
  (4 to 48 kg in 4 kg steps). A 24 kg kettlebell +2.5 goes to the next bell, not 27.5.
- A plate calculator opens from any barbell load in the timer and the set grid.

## Relative loads and refs

- Loads as a % of a training max or × bodyweight are worked out into kilos before the timer runs,
  on both platforms, and show in both set grids. iOS has the training maxes (Settings, and a link
  on a workout that uses them), synced on `user_state.prefs.trainingMaxes`.
- Ref items (a shared warm-up) are inlined before a session on iOS as on the web, and listed on the
  workout page.

## Bug

- The web result sheet asked "Made it / Missed" on every exercise when one block had a
  progression rule. It asks only for the exercises a rule covers.

Code: `src/features/runsheet/plates.ts` (ported to `ios/TigerWorkouts/Model/Plates.swift`, which also
holds `Relative`), set types in `model.ts` / `runner.ts` and their Swift ports.

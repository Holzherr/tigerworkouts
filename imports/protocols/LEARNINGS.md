# Protocols and formats — import learnings

## Source
- No single site: 25 workouts from ACSM/NYT (7-minute), Tabata 1996, CrossFit (Tabata This, Filthy Fifty, FGB, The Chief, Baseline, 30 MU, death-by, EMOM definition), Hyrox/HyCrew/Rox Lyfe, US Army, Forces News (British Army), Military.com + Marine Corps Times (USMC), Wikipedia (Cooper).
- Blocked fetches: ACSM journal (402 paywall), nytimes.com/archive.nytimes.com (tool refuses), hyrox.com (403), army.mil/aft (429), PubMed (cookie wall), fitness.marines.mil (403), Washington Post (403). Worked around with Wikipedia, HyCrew, reprints and web-search snippets; each original `.md` says which.
- crossfit.com WOD pages (`/workout/YYYY/MM/DD`) fetch fine and carry the full prescription, but the Baseline / Tabata This wodwell pages render client-side (shell only, same as the Girls import found).
- army.mil/acft redirects to /aft: the ACFT became the AFT in June 2025 and lost the Standing Power Throw. Imported the six-event ACFT as asked, with the change in `description`.
- Hyrox 2025/26: Women Open wall balls dropped to 75 reps; loads unchanged. Modelled 100 reps (the standard format) with the change in a note.
- Skipped: DT and Kalsu (Hero WODs, left to `imports/crossfit-heroes`); British Army Soldier Conditioning Review (the recruit test, not asked for); the Hyrox Pro/Doubles divisions (in `description` only).

## Modelling
- **Music-synced cadence (Bring Sally Up)**: one `bw_squat` step, `forMode: seconds`, `forValue: 210`, cadence in `note`. The app cannot know where "up" and "down" fall; a `cue`/`beat` track (list of `{at: seconds, text}`) on a step, or an external audio start, would make this runnable.
- **Death-by ladders**: `mode: ladder`, `ladder: [1..10]`, plus `everySec: 60` (not defined for ladder blocks; the validator ignores it) and a "continue +1" note. The per-minute clock is the whole point and is lost: a `deathby` mode (ladder + everySec, stop on first failed rung) is the fix. `fold-ladders.mjs` would have folded 10 per-rung `fortime` blocks into the same shape anyway.
- **Max reps / max hold**: `forMode: max`, `forValue: 0` (USMC pull-ups and plank, ACFT plank). Timed max efforts (HRP 2 min, Tabata 20 s, FGB stations, Cooper 12 min) stay `seconds`/`minutes` with "max reps" in `note` — the score is reps, not time, and there is no place to say so. A block/step `score: reps | calories | distance | time | load` would cover FGB, Tabata score = lowest round, Cooper distance, SPT distance.
- **3RM / max load (ACFT deadlift)**: `forMode: reps, forValue: 3`, no `target` (the test is the load). Needs `score: load` or a `findMax` flag; the 140–340 lb scoring range is only in `note`.
- **Station-based races (Hyrox)**: 16 loose steps (run, station, run, station...). Works, but there is no notion of "station" or split times per segment; a `segments`/lap view with per-step splits would make it a race sheet. Sled loads include the sled — said in `note` and the exercise cue, no field for it.
- **Tests with unknown distances (British Army RFT(S))**: casualty drag, water-can carry, lift-and-carry are published with loads but not distances or reps. Used `forMode: reps, forValue: 1` with "distance not published" notes; ugly but honest.
- **Tabata**: block `rounds` × 8 of `[20 s, rest 10 s]`. Score = lowest round has no field (note). Tabata This = five such blocks with 60 s rest steps between, 24 min total.
- **EMOM**: `mode: emom`, `everySec: 60`, `repeat` = minutes. Alternating EMOMs use `everySec: 120` with both exercises as steps and a note; the UI will show "EMOM 10" for a 20-minute workout. An `alternate: true` flag (or per-step `minute` offsets) would fix the label and the timer.
- **Wall-ball EMOM (Rox Lyfe)**: `target: 9 / rx 9/6` = "slightly heavier than race weight"; the source gives no number, so this is an interpretation.
- **The Chief**: five `amrap` blocks (180 s) with loose 60 s rests between them, because an amrap block cannot repeat with rest inside. A `repeat` + `restSec` on amrap blocks would collapse it to one block. Women's load (43 kg) is common practice, not on crossfit.com — flagged in `note`.
- **Fight Gone Bad**: `rounds` × 3 of five 60 s stations + 60 s rest; score = total reps + calories (note only).
- **Seven-minute workouts**: 30 s work / 10 s rest as exercise + rest steps in one `rounds` block. The Advanced version has no rests and uses `perSide: true` for the 60 s-per-leg single-leg RDL; L/R side planks separated by another exercise stay as two steps.
- **Per-side timed work**: `perSide: true` on a `seconds` step — whether the timer doubles the duration or splits it is undefined in the model; assumed "per side" = the value each side.
- **ACFT rests**: the published rule is 2–5 min between events (5 min when testing alone) and up to 10 min before the run; modelled as 180 s / 600 s rest steps with notes. A rest `min/max` or `asNeeded` would be truer.
- Loads lb→kg per SCHEMA (45/35 → 20.5/16, 75/55 → 34/25, 135/95 → 61/43, 20/14 lb ball → 9/6.5 as in the Girls import, 10 lb ball → 4.5, 90 lb sled → 41, 40 lb KB → 18). 3 miles → 4828 m, 2 miles → 3219 m.
- `source.kind`: `protocol` for formats and tests, `benchmark` for the named CrossFit workouts (Tabata This, Filthy Fifty, FGB, The Chief, 30 MU, Baseline) and the Hyrox race, `article` for the NYT advanced workout and the Rox Lyfe sessions.

## New exercises
- 19 added here; `bb_power_clean`, `gym_sled_push`, `gym_sled_pull`, `bw_hand_release_pushup`, `bw_knees_to_elbows` reused from `crossfit-heroes`; `bw_wall_sit`, `bw_step_up`, `bw_crunch`, `bw_bench_dip`, `bw_back_raise` from `nhs`; `gym_wall_ball`, `gym_muscle_up`, `bb_push_press`, `bb_sdhp`, `bw_double_under` from `crossfit-girls`.
- Composite moves from the Advanced 7-Minute Workout (push-up to row to burpee, single-leg RDL to curl to press, lateral lunge to triceps extension, reverse lunge with rotation) are one key each; splitting them would break the 60 s interval.
- British Army task exercises (loaded march, casualty drag, water-can carry, casevac lift, repeated lift-and-carry, fire and movement) are single-use keys; `gym_loaded_march` uses group `walk`.
- `gym_sprint_drag_carry` is one composite exercise (unit `""`) rather than five sub-steps, so the 250 m shuttle stays one timed effort.

## App additions worth making
- `deathby` block mode (ladder + everySec, stop on failure) and `alternate` for EMOMs.
- Step/block `score` type (reps, calories, distance, load, lowest-round) so max-effort intervals and tests display the right result field.
- Amrap `repeat` + rest between cycles (The Chief, Tabata This).
- Cue/beat track on a step for music-synced challenges.
- Rest `min`/`max` or `asNeeded`.
- Race view with per-segment splits for Hyrox-style station formats.

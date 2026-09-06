# CrossFit Open imports – learnings

## Source
- 70 workouts: every scored Open workout 11.1 → 26.3 (2011: 6, 2012–2020: 5 each, 2021: 4, 2022–2026: 3 each). 15.1/15.1a, 18.2/18.2a and 23.2A/B are one file each because they share a clock; 21.3 and 21.4 are separate pages so they are separate files (21.4 notes that it starts as 21.3 ends).
- Skipped 18.0: a pre-season demo, never scored, not on games.crossfit.com.
- games.crossfit.com is the canonical source and needs no auth. 2011–2016 live on one page per year (`/workouts/open/<year>`, `<h3 class="c-heading-data">` per workout, all divisions inline). 2017+ are one page per workout (`/workouts/open/<year>/<n>`) showing a single division; `?division_category=1|2` (men/women) and `?scaled=0|1|2` (Rx/Scaled/Foundations) switch it. From 2023 the Rx text lists both genders with ♀/♂.
- wodwell.com returned 404 to every fetch (bot blocking), not usable headless.
- No licence text on the site; workouts are competition prescriptions, treated as public with our own descriptions.

## What the model handled
- Plain AMRAPs (11.1, 19.1, 24.2…): `amrap` + `timeCapSec`, exact fit.
- N rounds for time with a cap (17.5, 20.1, 18.3): `fortime`, `repeat`, `timeCapSec`, exact fit.
- Chippers with a cap (19.3, 20.4, 25.3, 26.1, 26.2): one `fortime` block, steps in order, cap on the block.
- Descending ladders where every reps-step shares the rung (14.5, 16.5, 19.5, 24.1, 18.4/20.3 halves, 18.2, 22.2 up-and-down): `ladder` mode with `ladder: [...]` and the cap on the block. 22.2's 1…10…1 is a 19-rung array.
- Time-extension formats (16.2, 19.2, 23.3, 17.3): one `fortime` block per section, `timeCapSec` = that section's window. Reads naturally: finish inside the cap to unlock the next block.
- 14.2/15.2 "every 3 minutes, 2 rounds of N": one `fortime repeat 2 timeCapSec 180` block per window, rungs listed to 20 reps.
- Multi-load couplets (22.3/25.2, 26.3, 24.3): separate blocks per load; loads on the steps via `target`/`rx`.
- Open-ended sets ("as many reps as possible at 210 lb" in 12.2/13.1, 12.1 burpees): `forMode: max`.
- 1RM parts (15.1a, 18.2a, 23.2B) and the 21.4 complex: 1-rep steps in a capped `fortime` block with a note; there is no "for load" mode.

## Workarounds and gaps
1. **Workout-level time cap.** When a cap spans several blocks with different content (17.1/21.2, 21.1, 22.3, 19.4, 21.3, 24.3, 26.3, 17.3, 18.2+18.2a) the cap sits on the first block with a note. The app should support `timeCapSec` on the runsheet, or a cap that spans a group of blocks.
2. **Ascending ladders inside an AMRAP** (11.6/12.5/18.5, 13.4, 25.1): modelled as `ladder` with explicit rungs and `timeCapSec`, so the score-is-total-reps meaning and "continue past 18" live only in the note. `ladder` also cannot express "one movement climbs, the other stays fixed" (17.1: snatches 10→50, burpee box jump-overs always 15; 21.1: wall walks n, double-unders 10n; 23.2A: burpee pull-ups +5, shuttles fixed 10; 15.4: +3 HSPU every round, +3 cleans every third round), so those are per-rung `fortime` blocks or an `amrap` with the first 4–7 rounds written out. A per-step `rungFactor`/`fixed` flag on ladder steps would cover all of them.
3. **Rest inside a for-time workout with a running clock** (19.4 rest 3:00, 21.3 rest 1:00, 24.3 rest 1:00): a top-level rest step between blocks. Fine for the timer, but the rest belongs to the same score.
4. **Interval windows** (14.2/15.2): six blocks of `fortime repeat 2 cap 180` instead of a proper "every 3:00, reps climb by 2" structure; `emom` with `everySec 180` would loop the same reps. An emom with per-round rep overrides would be closer.
5. **Per-arm dumbbell work** (18.1 hang clean and jerk 5 L + 5 R): `perSide: true` with forValue 5 shows 10 reps' worth of time but the Open counts 10 reps; 24.1's arm-1/arm-2 sets with burpees between are separate steps. Single-dumbbell movements reuse `kg per arm` keys (db_step_up, db_lunge) with a note.
6. **Distances** are converted to whole metres (25 ft → 8 m, 50 ft → 15 m, 80 ft → 24 m, 200 ft → 61 m) with the feet in the step note; handstand walk is scored per 5 ft segment but modelled as metres.
7. **Loads** are men's kg in `target` with `rx.men/women`; box heights, ball targets and rower calorie differences (18.1 women row 12 cal) are notes only. Masters/teen/scaled loads are in the description and the originals, not in the JSON.
8. **Partitioned work** (20.5 "any order"): one block, note says partition freely; the model has no "chipper, any order" flag.

## Exercise keys
- Reused: girls' `bb_thruster bb_clean_and_jerk bb_squat_clean bb_hang_power_clean bb_snatch bb_power_snatch bb_push_press bb_overhead_squat db_snatch gym_wall_ball gym_muscle_up bw_handstand_pushup bw_pistol bw_double_under bw_chest_to_bar_pullup bw_bar_facing_burpee`; heroes' `bb_power_clean bb_push_jerk bb_shoulder_to_overhead db_hang_clean_and_jerk bw_toes_to_bar bw_bar_muscle_up bw_burpee_pullup bw_burpee_box_jump_over cardio_shuttle_run`.
- Added here (11): `bb_clean` (any style, used where the Open says "cleans"), `bb_ground_to_overhead`, `bb_overhead_walking_lunge`, `db_power_clean`, `db_squat`, `db_overhead_lunge`, `bw_wall_walk`, `bw_handstand_walk`, `bw_box_jump_over`, `bw_burpee_over_dumbbell`, `gym_med_ball_box_step_over`.
- Strict HSPU and squat snatch are `bw_handstand_pushup` / `bb_snatch` with a note rather than separate keys; the library may want a `strict` flag.

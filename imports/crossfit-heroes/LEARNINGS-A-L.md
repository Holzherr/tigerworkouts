# Learnings: CrossFit Hero WODs, A–L

Imported 2026-09-06. 129 workouts (Abbate … Lumberjack 20; Murph is in M–Z), `cf-hero-<slug>.json`, originals in the assistant repo under `me/projects/workout-hub/imports/originals/crossfit-heroes/<slug>.md` (prescription, loads, bio, first-posted date, verbatim).

## Site / source

- `crossfit.com/heroes` is a React shell; `curl` gets no workouts. Rendered it with Playwright and read `document.body.innerText` (249 tiles: name, prescription, no loads) plus the `/benchmark/<slug>` links from the snapshot. The M–Z agent found the underlying JSON (`cms-api.crossfit.com/tiles?content_type=benchmark…`); use that next time.
- Detail pages `https://www.crossfit.com/benchmark/<slug>` are server-rendered: `div._prescription_*` (prescription with `<br>`), `div._weightStandards_*` (♀/♂ free text), `div._tributeText_*` (bio), `a._firstPostedLink_*`. Plain `curl -A Mozilla` at 0.3 s spacing, 129 pages, no throttling.
- `chad1000x` has a custom landing page (no `_prescription_` div); Rx / Intermediate / Beginner tiers were read from its `<main>` text.
- CMS slug suffixes dropped in our ids but kept in `source.url`: `city-100-hero`, `dt-new`, `holleyman-new`, `hoover-hero`, `jacks-triangle-h`.
- No load published for: Bert, Bradley, Capoot, Clovis, Coffland, Dragon (find a 4RM), Emily, Forrest, Garrett, Griff, Gunny (50 lb "however you like"), Hamilton, Hortman, Jared, Jason, Jerry, JT, Loredo, Lorenzo (med-ball cleans, no weight). Kerrie and Drew say "wear a weight vest" with no weight. Justin and Drew are bodyweight-relative.
- Weight standards are free text and sometimes per movement ("♀ 95-lb squat clean, 125-lb deadlift, 20-inch box"); assigned per step by hand. Buriak's 155/135 lb is unusually close and is what the page says.

## Modelling: what fit

- "N rounds for time" → `fortime repeat N`; "for time" chippers → one `fortime repeat 1` block; multi-part chippers ("run, then 8 rounds of, then run") → one block per part, in order (Alec, DVB, Estrada, Gage, Josie, Josh-O, Jonathon Farmer, Leehan, Locke, Lorenzo).
- AMRAP → `amrap` + `timeCapSec`. Rep ladders (Carse, Donny, Feeks, Larry, JT, Justin, Josh, Jorge, J.J.) → one `fortime` block per rung; J.J. and Jorge are crossing ladders so each rung block names both counts ("3 / 8").
- Rest between rounds (Bradley, Emily, Hall, Hammer, Holbrook, Kerrie) → trailing rest step inside the block, so the final round ends with a spurious rest.
- Loads: `target` = men's kg, `rx.men/women`, lb ÷ 2.2046 to 0.5 kg; kettlebells snapped to real bells (53/35 → 24/16, 70/53 → 32/24, 1.5/1 pood → 24/16). Original lb in the step note. Box heights, wall-ball targets, "carry a plate / med ball", "on parallettes / rings", "right arm / left arm" are notes.
- Weight vests → block `note` ("Wear a 20/14 lb weight vest") on every block of the workout.
- Used the newer model fields the validator now accepts: `forMode: "max"` for open-ended stations (Dallas 5, Dominic J. Hall, Jack's Triangle) and `loadFactor` for bodyweight-relative bars (Drew 1.5, Justin 1). Did not use `mode: "ladder"` because it scales every rep step to the rung, which breaks Carse (bear crawl in metres per rung) and the crossing ladders.

## Modelling: what did not fit (top 5)

1. **Buy-in then AMRAP on one clock** (Finseth: 83 wall balls then AMRAP, 18-min clock; Garbo: 400 m then AMRAP, 21-min clock; Foo: 13 bench for time then a separate 20-min AMRAP). Modelled as a `fortime` buy-in block followed by an `amrap` whose `timeCapSec` is the whole clock, with notes; the app will over-run by the buy-in time. Needs a runsheet-level clock that blocks consume, or an AMRAP `startsAtSec`.
2. **Penalty-per-event structure** (Coffland: hang 6 min total; each drop = 800 m run + 30 push-ups). Modelled as a hang step (`minutes: 6`) plus a second "Penalty (per drop)" block with a note that it runs once per drop. No way to express "repeat this block an unknown number of times triggered by an event".
3. **Partner workouts** (City 100, Eva Strong, Goose, Horton, Josh-O, Kev, Laura): imported as written with a "Partner" tag and block notes ("split the work", "one partner holds the bar in the front rack"). City 100's hold-while-partner-works and Kev's synchronised burpees have no representation. Needs a `partner` flag and per-step `share: each | split | sync`.
4. **Timeline workouts with fixed timestamps** (Dominic J. Hall: max step-ups 0:00–12:23, rest to 15:00, AMRAP to 48:00; Jack's Triangle: 2 min max deadlifts, 19-min AMRAP, 2 min max deadlifts; Dallas 5: five 5-min stations with 1 min rest). Modelled as consecutive `amrap` blocks with odd `timeCapSec` values (743 s, 1980 s) and loose rest steps; works on the timer but the score (total reps across blocks) has nowhere to live. Needs a block/runsheet score type.
5. **Distance-based non-cardio movements and odd units** (bear crawl and broad jump in feet, overhead lunge in feet, farmers carries in yards/feet, shuttle runs "7 m down and back", "100 m shuttle sprints" counted as reps). Carries and crawls use `forMode: meters` on a strength-style exercise; shuttle runs are `cardio_shuttle_run` with `reps` and the distance in a note. Feet/yards converted to whole metres (100 ft = 30 m, 50 ft = 15 m, 50 yd = 46 m, 22 yd = 20 m, 55 ft = 17 m). Runs backwards (Griff), with an empty barbell (Dae Han) and weighted (Gunny) are all `cardio_run` + note.

Smaller ones: Dragon's "4 minutes to find a 4-rep max" is a 4-rep deadlift/jerk step with a note (score is time + load); Brenton's "3 burpees after every 5 broad jumps" is a note; Gale Force's group finisher after the clock is a separate `rounds` block; FERN's 60-minute cap sits in a note because the cap spans three blocks; Horton's solo variant (5 reps, sandbag) is a note; Lorenzo prescribes no med-ball weight so the step has no `target`.

## Exercise keys

- Reused from `crossfit-girls`: `bb_thruster bb_clean_and_jerk bb_squat_clean bb_hang_power_clean bb_snatch bb_push_press bb_sdhp bb_overhead_squat db_snatch gym_wall_ball gym_muscle_up gym_ring_dip bw_handstand_pushup bw_double_under bw_chest_to_bar_pullup bw_bar_facing_burpee`.
- Reused from the M–Z agent's entries in this folder (rewrote my spec to theirs when both existed): `bb_power_clean bb_push_jerk bb_squat_clean_thruster bw_weighted_pullup bw_bar_muscle_up bw_burpee_muscle_up bw_burpee_box_jump db_farmers_carry db_squat_clean db_deadlift gym_sandbag_over_shoulder kb_thruster` plus the shared `bw_toes_to_bar bw_knees_to_elbows bw_l_pullup bw_burpee_pullup bw_burpee_box_jump_over bw_hand_release_pushup bw_bear_crawl gym_rope_climb gym_ring_pushup gym_ghd_situp gym_back_extension gym_plate_overhead_lunge gym_sandbag_carry`.
- Added by A–L (25): `bb_shoulder_to_overhead bb_overhead_lunge bb_front_rack_lunge bw_strict_pullup bw_broad_jump bw_forward_roll bw_wall_climb bw_dead_hang bw_box_step_up bw_hanging_hip_touch gym_ruck_step_up gym_sled_push gym_sled_pull gym_medball_clean gym_partner_carry kb_overhead_squat kb_clean_and_jerk kb_front_rack_lunge kb_front_rack_carry kb_overhead_carry db_split_clean db_squat_clean_thruster db_front_squat db_hang_clean_and_jerk cardio_shuttle_run`.
- Mapping choices: "cleans" and "squat cleans" → `bb_squat_clean`; "jerks" and "push jerks" → `bb_push_jerk`; "burpee bar muscle-up" → `bw_burpee_muscle_up` + note; ring / parallette / deficit HSPU → `bw_handstand_pushup` + note; toes-to-rings → `bw_toes_to_bar` + note; triple-unders → `bw_double_under` + note; step-overs → `bw_box_step_up` + note; dumbbell Turkish get-up → `kb_turkish_getup` + note; backpack / ruck step-ups → `gym_ruck_step_up` (unit kg = pack weight) while vest step-ups stay `bw_box_step_up` with the vest on the block; double-kettlebell farmers carry → `db_farmers_carry` + note; "bike" calories → `cardio_assault_bike`.
- Kept both `bb_overhead_lunge` (City 100, barbell) and `gym_plate_overhead_lunge` (Blake, Hidalgo, plate) as the implement changes the movement.
- `new-exercises.json` was read-merge-written; the merge keeps whichever definition was there first, so `bb_power_clean`, `db_squat_clean`, `db_deadlift`, `kb_thruster` carry the M–Z names.

## App suggestions

- Runsheet-level clock with blocks that consume it (buy-in + AMRAP), and a score type on blocks/runsheet (`time | rounds | reps | load`).
- `partner` flag with per-step share mode.
- An event-triggered penalty block (Coffland), or at least a "repeat as needed" block flag.
- Distances for carries / crawls / lunges: a `unit: "m"` display per step so the stepper shows metres, and imperial input (ft/yd) on import.
- `ladder` mode should allow per-exercise rung arrays (crossing ladders like J.J., Jorge, Josh) and fixed-quantity steps that do not scale (Carse's bear crawl).

# Learnings: CrossFit Hero WODs, M–Z

Imported 2026-09-06. 120 workouts (Maloney … Zimmerman, Murph included), `cf-hero-<slug>.json`, originals in the assistant repo under `me/projects/workout-hub/imports/originals/crossfit-heroes/`.

## Site / source

- `crossfit.com/heroes` is client-rendered; curl gets an empty shell. The page loads everything from one JSON call: `https://cms-api.crossfit.com/tiles?content_type=benchmark&order_by=title&per_page=500&sort=asc` (395 tiles, 249 with category `hero`). Fields used: `title`, `slug`, `acf.prescription` (HTML with `<br />`), `acf.weight_standards`, `acf.first_posted`, `acf.link.url` (original WOD post), `acf.content.description` (honoree bio). No auth, no rate limiting seen.
- Detail pages are `https://www.crossfit.com/benchmark/<slug>` (not `/heroes/<slug>`); the only `/heroes/…` URL that exists is `murph-workout`.
- CMS slug quirks: Paul Pena's tile has slug `scooter` (collides with Scooter), so its `source.url` points at the original 2017-01-19 post. Several slugs carry suffixes (`the-don-hero`, `the-seven-new`, `tpt9000-hero`, `tumilson-hero`, `white-hero`, `whitt-hero`, `woehlke-hero`); our file slugs drop them, `source.url` keeps them.
- Prescription text is uneven: some tiles have loads inline (Restrepo), most put them in `weight_standards`; Wes gives a men's load only; Santora's text mentions shuttle sprints that are not in the workout; Zeus/Ned/Sham/Martin use "bodyweight" loads; Miron/Otis use bodyweight multiples. All kept verbatim in the originals.
- `weight_standards` is free text ("♀ 185-lb deadlift, 125-lb hang power clean, 95-lb push press"): per-movement loads had to be assigned by hand.

## Modelling: what fit

- "N rounds for time" = `fortime`, `repeat: N`. "For time" chippers = one `fortime` block, `repeat: 1`, or loose steps around an inner block (Muller, Pat, Rich, Wade…). AMRAP = `amrap` + `timeCapSec`. Rep ladders (Morrison, Stephen, T.U.P., Omar, Tommy V) = one `fortime` block per rung.
- Rest between rounds (Maloney, PK, Paul Pena, T, The Lyon, Woehlke, Wood, Santora) = trailing rest step inside the block; block `note` says so. The last round therefore ends with a redundant rest.
- Loads: `target` = men's kg, `rx.men/women` from the ♂/♀ standards, lb ÷ 2.2046 rounded to 0.5. Original lb kept in the step `note` (e.g. "135/95 lb"). Vests, box heights, wall-ball targets, plates for runs are notes only.
- Runs with a plate / med ball / vest = `cardio_run` + note. 1 mile = 1609 m, 1.5 mi = 2414, 2 mi = 3219, 5 mi = 8047, 6 mi = 9656; 20 yd = 18 m, 21 yd = 19 m, 50 yd swim = 46 m.
- Partner / team workouts (Martin, Maxim 56, McCartney, Partner Weston, Scooter, Ryan Comas, Timothy Helton) imported as written with a "Partner"/"Team" tag and a block note; the app has no concept of shared work.

## Modelling: what did not fit (bent, in order of pain)

1. **"Max reps" steps** (Nukes: mile + max deadlifts in 8 min; Moore: max-set HSPU; Santora: 1 min max reps per station; T.J.: max-set thrusters). `forValue` must be > 0, so these are `forValue: 1` (or `minutes: 1`) with a note. Needs a `forMode: "max"` or an `openEnded: true` flag.
2. **Clock-bounded then AMRAP** (Tiff: 25-min clock, run 1.5 mi then AMRAP; Wesley: 35-min clock, 800 m then AMRAP; Peyton: 20-min AMRAP then a 2-mile run; Scooter: 30-min AMRAP + 5 min to find a 1RM). The AMRAP `timeCapSec` is the whole clock, the run is a loose step before it, and the note explains that the clock includes the run. Needs a runsheet-level `clockSec` with blocks that consume it.
3. **Ascending / open-ended round counts** (Otis: 1-1-1, 2-2-2, 3-3-3… in 15 min; T.J.: repeat the triplet until 100 thrusters; Shawn: run 5 miles in 5-minute intervals with 50 squats + 50 push-ups after each). Otis is an `amrap` with per-step "add 1 rep per round" notes; T.J. is a single `fortime` block with `bb_thruster forValue: 100`; Shawn is `rounds repeat: 8` with a note that the count depends on pace. Needs a per-round rep increment and an "until total reps" terminator.
4. **Interval-in-AMRAP** (Peyton: 40 double-unders every 2 minutes including 0:00). Modelled as the first step of the AMRAP round with a note; the app cannot fire a step on a timer inside an AMRAP. Needs an `every: {sec, steps}` on blocks.
5. **Multiple loads on one bar** (Matt 16, Nukes, Nunez, Tama, Pheezy, Santora, PK, Thompson) and **relative loads** (Miron ¾ / 1½ bodyweight, Otis, Ned, Sham, Martin, Zeus "bodyweight"). Per-step `target`/`rx` handles absolute loads fine; relative ones have no `target` and a note. Needs `targetPct: {of: "bodyweight" | "1rm", value}`.
6. Minor: "each for time" workouts (Paul Pena, The Lyon, Woehlke) are scored per round, not total; no per-round scoring. Manuel's timed stations use `forMode: minutes` inside a `rounds` block, which the app treats as fixed durations (correct here). Maxim 56 "56-second handstand hold *or* wall sit" = handstand step with the alternative in the note.

## Exercise keys

- Reused from `crossfit-girls/new-exercises.json`: `bb_thruster bb_clean_and_jerk bb_squat_clean bb_hang_power_clean bb_snatch bb_power_snatch bb_push_press bb_sdhp bb_overhead_squat db_snatch gym_wall_ball gym_muscle_up gym_ring_dip bw_handstand_pushup bw_handstand bw_pistol bw_double_under bw_chest_to_bar_pullup bw_bar_facing_burpee`; from `nhs`: `bw_wall_sit bw_step_up`. Note `bw_double_under` (girls) is prefixed `bw_` although SCHEMA lists rope under `gym_`.
- Generic "cleans" mapped to `bb_squat_clean`; "jerks" and "shoulder-to-overhead" to `bb_push_jerk` with a note; "any snatch" to `bb_power_snatch`; ring dips (Wilmot, Pike) to `gym_ring_dip`; Wade's "strict dips" to library `bw_dip`. Strict / deficit / freestanding / on-rings / on-dumbbells variants of pull-ups and HSPU are notes, not keys.
- 39 new keys added here (barbell carries and step-ups, dumbbell cleans/snatch variants/carries, kettlebell thruster and lunge, weighted and L pull-ups, bar muscle-up, toes-to-bar, knees-to-elbows, hand-release push-up, burpee variants, bear crawl, flutter kicks, rope climb, ring row/push-up/inverted lower, GHD sit-up, back extension, plate carry/overhead lunge, sandbag carry/over-shoulder, ball slam). Carries use `forMode: meters` with a load `target`. `bw_flutter_kick` is 4-count = 1 rep.
- The A–L agent writes the same `new-exercises.json`; my generator re-reads it and only appends missing keys, dropping my own entries when another source defines the same key.

## App suggestions

- `forMode: "max"` (score the reps) and `targetPct` (bodyweight / 1RM) would cover 12 of the 120 without notes.
- A `clockSec` on the runsheet and `every` on blocks would cover Tiff, Wesley, Peyton, Scooter cleanly.
- Per-round scores for "each for time" blocks.
- A `partner: true` / `team: 3` flag so the UI can show "one works, one rests".

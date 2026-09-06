# Imported workouts: format

Every imported workout is one JSON file in `imports/<source>/<slug>.json` shaped as a **Runsheet**
(the app's own format, see `src/features/runsheet/model.ts`). The original text goes in the
private assistant repo, not here; this folder holds only our structured version plus a source
link for attribution.

Validate with `node tools/validate-imports.mjs` before committing.

## Runsheet

```jsonc
{
  "id": "cf-girls-fran",                 // <source-prefix>-<slug>, lowercase, hyphens
  "title": "Fran",
  "creator": "CrossFit",                 // who authored the workout (person or org)
  "description": "21-15-9 reps for time of thrusters and pull-ups. The most famous CrossFit benchmark.",
  "source": {
    "title": "Fran – CrossFit benchmark WOD",
    "url": "https://www.crossfit.com/workout/...",
    "author": "CrossFit",
    "kind": "benchmark",                 // benchmark | program | video | article | protocol
    "license": "Public benchmark; description in our own words",
    "importedAt": "2026-09-06"
  },
  "tags": ["CrossFit", "For time", "Barbell"],
  "level": "Hard",                       // Easy | Medium | Hard
  "program": { "name": "StrongLifts 5x5", "day": "Workout A", "order": 1 },   // only for program days
  "items": [ /* steps and blocks, in order */ ]
}
```

## Items

A step is an exercise or a rest. A block is a named list of steps with a mode.

```jsonc
// exercise step
{ "kind": "exercise", "id": "s1", "exercise": "bw_thruster", "target": 43, "rx": { "men": 43, "women": 29 },
  "forMode": "reps", "forValue": 21, "note": "95/65 lb" }
// forMode: seconds | reps | minutes | meters | calories | max
// target: load/speed in the exercise's unit (kg, kg per arm, kph, W). Omit for bodyweight.
// rx: prescribed men's/women's loads in the same unit when the source gives both. Convert lb→kg (÷2.2046, round to 0.5).
// startSeconds: for follow-along videos, where this step starts in the video.

// rest step
{ "kind": "rest", "id": "r1", "seconds": 60 }

// block
{ "kind": "block", "id": "b1", "name": "21-15-9", "mode": "fortime", "repeat": 1, "timeCapSec": 600,
  "note": "Rep scheme 21-15-9", "steps": [ ...steps ] }
// mode: rounds (default; repeat = times through) | fortime (repeat rounds, clock counts up, optional timeCapSec)
//       | amrap (as many rounds as possible in timeCapSec; repeat ignored) | emom (steps start every everySec, repeat times)
//       | ladder (rep scheme: "ladder": [21, 15, 9]; every reps-step runs once per rung with forValue = the rung)
```

Rules:
- **Rep ladders (21-15-9)**: one `ladder` block: `"mode": "ladder", "ladder": [21, 15, 9]`, steps listed once with `forMode: reps` (forValue = first rung). Ascending ladders (3-6-9…) list the rungs explicitly up to the expected finish, note "continue +3".
- **Max effort** ("max reps pull-ups", "plank max hold"): `forMode: "max"`, forValue 0.
- **Each side** (lunges L/R, single-arm rows): one step with `"perSide": true`, not two steps.
- **Ranges** ("15 to 24 reps"): `forValue` = lower bound, `forMax` = upper bound.
- **Relative loads**: `loadFactor` (× bodyweight, e.g. 1.5) or `targetPct` (% of training max, e.g. 65) instead of `target`.
- **Rounds**: "5 rounds of A, B, C" = one block, `repeat: 5`, no rest steps unless the source says.
- **Intervals** (30s on / 30s off): exercise step `forMode: seconds` followed by a rest step, block `repeat` = rounds.
- **Sets × reps** (5×5 squat): block `repeat: 5`, steps: exercise `forMode: reps, forValue: 5`, rest step (use the source's rest, else 90s for strength, 60s otherwise).
- **Steady cardio** ("run 5 km", "20 min walk"): a loose exercise step, `forMode: meters | minutes`.
- **Programs** (StrongLifts, C25K): one file per distinct day/session; identical sessions repeated across weeks are one file with the schedule in `description`. Set `program.name`, `program.day`, `program.order`.
- **Follow-along videos**: one file per video; steps carry `startSeconds` when the description or chapters give timestamps; if there are no timestamps, still list the exercises and leave `startSeconds` out.
- Loads in lb → kg. Distances stay in metres. Time in seconds.
- Keep `description` in **your own words** (2 to 4 sentences: what it is, why it's famous, how to scale). Do not paste the source text.

## Exercise keys

Use these keys (from `src/features/exercises/library.ts`). Match by meaning: "air squat" → `bw_squat`,
"pull-ups" → `bw_pullup`, "row 500 m" → `cardio_rower` with `forMode: meters`, "run 400 m" → `cardio_run`
with `forMode: meters`, "walk" → `cardio_walk` (new, see below).

```
bb_back_squat bb_front_squat bb_deadlift bb_rdl bb_bench bb_incline_bench bb_ohp bb_row bb_hip_thrust bb_lunge bb_curl
db_shoulder_press db_incline_press db_bench db_row db_rdl db_goblet_squat db_lunge db_bulgarian db_thruster db_curl
db_hammer_curl db_tricep_ext db_front_raise db_rear_delt_fly db_step_up db_floor_press lat_raise
kb_swing kb_goblet_squat kb_clean kb_press kb_snatch kb_deadlift kb_turkish_getup kb_row
bw_pushup bw_pullup bw_chinup bw_dip bw_squat bw_lunge bw_burpee bw_plank bw_side_plank bw_mountain_climber bw_situp
bw_leg_raise bw_hip_bridge bw_jump_squat bw_box_jump bw_jumping_jack
cable_lat_pulldown cable_row cable_face_pull cable_tricep_pushdown
machine_leg_press machine_leg_curl machine_leg_ext machine_chest_press machine_shoulder_press
sprint incline_walk cardio_run cardio_rower cardio_bike cardio_assault_bike cardio_stairmaster cardio_cross_trainer cardio_skierg cardio_jump_rope cardio_swim
```

## New exercises

When the source needs an exercise that is not in the list, add it to `imports/<source>/new-exercises.json`
as an array and use its key in your workouts. Keys are `<equipment>_<name>`: `bb_` barbell, `db_` dumbbell,
`kb_` kettlebell, `bw_` bodyweight, `cable_`, `machine_`, `cardio_`, `gym_` (rig/rings/wall ball/sled/rope).
Units: `"kg"`, `"kg per arm"`, `"kph"`, `"W"`, or `""` for bodyweight. `group` is one of
barbell, dumbbell, kettlebell, body, core, band, treadmill, walk, run, bike, rower, swim, gym.

```json
[
  { "key": "bb_thruster", "name": "Barbell thruster", "unit": "kg", "step": 2.5, "group": "barbell",
    "cue": "Front squat straight into a push press, one movement." },
  { "key": "gym_wall_ball", "name": "Wall ball", "unit": "kg", "step": 1, "group": "gym",
    "cue": "Squat with the ball at the chest, drive up and throw to the target, catch and drop straight into the next rep." }
]
```

Check the other sources' `new-exercises.json` files first and reuse a key if one exists.

## Learnings

Each source folder also gets a `LEARNINGS.md`: what the source's workouts look like, what did not
fit the model and how you bent it, what fields or step types the app should add, and anything odd
about the site (structure, rate limits, licences). Keep it to bullets.

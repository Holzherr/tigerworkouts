# NHS imports: learnings

## What the source looks like
- Two families: (A) short illustrated home routines on nhs.uk/live-well/exercise (10-minute series, warm-up, stretches, older-adult strength/balance/flexibility/sitting sets, rehab pages) and (B) Couch to 5K, now hosted on the Better Health site (`nhs.uk/better-health/get-active/...`), which lists all 27 runs with exact times.
- Licence is Open Government Licence v3.0 (Crown copyright); attribution to NHS is enough. Text is short and plain so "own words" descriptions were easy.
- **Most of the 10-minute series is gone from the live site.** `10-minute-workouts`, `10-minute-home-cardio-workout`, `10-minute-home-toning-workout`, `10-minute-abs-workout`, `10-minute-upper-arms-workout`, `gym-free-workouts`, `strength-and-flex-exercise-plan` all 301 to `/live-well/exercise/`; `10-minute-legs-bums-tums-home-workout`, `10-minute-firm-butt-workout`, `5-minute-wake-up-workout`, `how-to-stretch-after-a-run`, `exercises-for-sciatica`, `lower-back-pain-exercises` 404. All were recovered from the Wayback Machine (2022 snapshots, 2019 for the two rehab pages); `source.url` points at the archive URL. The NHS Fitness Studio (`/conditions/nhs-fitness-studio/`) also redirects to the exercise index.
- Wayback `id_` raw snapshots come back gzip-encoded for some pages; check for the `1f8b` magic before parsing.
- Pages that exist but have no concrete exercise list (skipped): Strength and Flex 5-week plan (podcast/video only; the how-to page lists 15 exercises but no reps or order), aerobic / strength-and-resistance / pilates-and-yoga video pages, Better Health home-workout videos (3 videos, no chapters), sciatica live page (video only), lower-back-pain live page (redirects to the condition page).
- `gym-free-workouts` (14 "illustrated guides": sprinter, pillow, sofa, stairs, cardio hill...) are 320 px posters credited `© neilarey.com` (Darebee). Not NHS-authored, not OGL. Skipped on licence grounds even though the text is legible.
- Wall squats and squats on the live knee page carry no set/rep counts (the 2022 version had 3x10 for both, and four extra exercises). Used the 2022 counts and noted it in the file.

## Counts
- A: 17 workouts (7 from the old 10-minute series incl. the 5-minute wake-up, warm-up, 2 stretch routines, knee exercises, strength, flexibility, balance, sitting, sciatica, lower back).
- B: 13 Couch to 5K files covering all 27 runs (weeks 1-4 and 7-9 have three identical runs, one file each; weeks 5 and 6 have three distinct runs, one file per run). `program.order` 1-13.
- 60 new exercises, of which ~24 are stretches/mobility holds.

## How the model was bent
- **Warm-up and cool-down have no home.** C25K sessions are `walk 5 / intervals / walk 5`, and every 10-minute workout says "do the 6-minute warm-up first and the 5-minute stretch after". Modelled the warm-up/cool-down walks as loose `cardio_walk` steps (`forMode: minutes`) and the shared warm-up/stretch routines as their own runsheets (`nhs-6-min-warm-up`, `nhs-5-min-cool-down-stretch`) referenced from the description. A `section` tag on items (`warmup | main | cooldown`) or a `prelude`/`postlude` reference to another runsheet would remove the cross-reference by id in prose.
- **Static stretches are exercise steps with `forMode: seconds`.** Works, but a stretch is not a set; the timer UI will treat "hold 15 s left" then "hold 15 s right" as two exercises. Sided moves are modelled as two steps in a block (Left / Right notes), repeated `n` times. A `sides: 2` or `perSide: true` flag on a step would halve the step count in most NHS files.
- **Rep and time ranges** ("15 to 24 reps", "hold 5 to 10 s", "20 to 30 s") became the lower bound in `forValue` with the range in `note`. A `forValueMax` (or `forRange: [15, 24]`) field is the obvious fix; NHS uses ranges almost everywhere.
- **Rest is invented.** NHS gives no rest between sets, only a total time of 10 minutes; used 20 s in the 10-minute toning/LBT files (19 sets in 10 minutes), 30 s in the cardio and 3-set files. The SCHEMA default of 60 s would make the "10-minute" workouts 25-30 minutes.
- **Breath-counted holds** ("3 to 4 deep breaths", "5 to 10 breaths") became 20 s. A `forMode: breaths` would be truer to the source.
- **Repeat-per-side vs alternate.** "Repeat 8 to 10 times, then the other side" (side plank, thigh contraction) is modelled as a block `repeat 8` of [left, right], which alternates sides. Faithful ordering would need two blocks or a per-side flag.
- **Walking as an exercise.** Recovery walks in C25K are `cardio_walk` steps, not `rest`, so the timer shows "walk" rather than "rest". `cardio_walk` unit is kph but no target is set.
- **Identical sessions repeated 3x** in one file (weeks 1-4, 7-9) rely on the description to say so. `program` could use `repeats: 3` or a `sessions: ["Run 1","Run 2","Run 3"]` list.
- **Rep counts for time-based moves**: "60 heel digs in 60 seconds" became `seconds: 60` with the target count in `note`; the model has no way to express a rate.
- **Keys**: added a `band_` prefix (schema lists `band` as a group but not as a key prefix) for the resistance-band toning moves; stretches sit under `bw_stretch_*` in group `body` because there is no stretch/mobility group. A `mobility` group would be worth adding, and stretches should probably not count towards volume stats.
- Static split-stance lunges use the existing `bw_lunge` ("Walking lunge") with a note; bench dips on the floor and on a chair share `bw_bench_dip`; rocket jumps reuse `bw_jump_squat`. The `db_curl` key is used for "light weights or water bottles".

## Top 5 modelling problems (for the app)
1. No warm-up / cool-down sections or way to link a shared warm-up routine.
2. No per-side flag; every unilateral move doubles the step count.
3. No rep/time ranges; NHS is range-based throughout.
4. No stretch/hold semantics or mobility group; stretches look like exercises with a duration.
5. No rest guidance in the source, so rest steps are guesses fitted to the advertised 10-minute duration.

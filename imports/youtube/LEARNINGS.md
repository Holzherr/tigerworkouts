# YouTube follow-alongs — import learnings

## Source
- Fetched with plain `curl -A Mozilla` + `CONSENT`/`SOCS` cookies; the watch page embeds `ytInitialPlayerResponse` (title, author, `viewCount`, `lengthSeconds`, `shortDescription`) and `ytInitialData`, which carries YouTube's **key moments** (`chapterRenderer` / `macroMarkersListItemRenderer`). No rate limiting over ~90 page loads. The channel "Popular" tab ignores `sort=p` server-side; `/results?search_query=<creator>` returns the big videos with view counts, which is how the 28 were chosen.
- Captions are unreachable without a browser: `timedtext` URLs return empty and the innertube ANDROID client returns an error, so no transcripts. Exercise sequences therefore come from (a) the description, (b) key moments, (c) third-party lists.
- **Key moments are OCR of on-screen captions, not creator chapters.** They are exact timestamps but incomplete (Chloe Ting abs: 12 of 17 moves; Joe Wicks: 13–17 of 20) and sometimes garbled ("SLUAT JUMPS", "CRAN TOE TOUCH"). For Yoga With Adriene they are spoken cues ("lift the sternum", "walk with the fingertips"), not pose names. Fill gaps only where the creator's interval grid is fixed and the known moments confirm it.
- **fitlycafe.com** (Wix site, ~200 workouts, sitemap at `dynamic-workouts_*-sitemap.xml`) has hand-typed exercise lists with the interval format and a "workout starts at" time for most Chloe Ting / Pamela Reif / MadFit / growingannanas / Yoga With Adriene videos. It was the only source for Pamela Reif's sequences (her descriptions never list exercises). **fitnessblender.com** has a canonical page per video with the structure and every move (`gofb.info` short links in the description redirect there). Skimble is behind Cloudflare; Tom's Guide / Bustle articles never give full lists.
- Reliability per creator:
  - **Heather Robertson**: gold. Description has "Workout Breakdown" with a timestamp per exercise and the work/rest scheme; older videos (2020, the 6.4M-view no-repeat) do not.
  - **Caroline Girvan**: description lists every set in order with her loads, but no timestamps and set counts are implied by repeated lines ("CHEST PRESS" ×3).
  - **Sydney Cummings**: newer (2023+) descriptions list "The Exercises" and the format; key moments then supply timestamps. Her most-viewed video (4.8M, 2019) has neither.
  - **growingannanas**: format line always present ("50 Sec Work, 10 Sec Rest, No Repeat"); exercise list only on some (2022+) videos, else FitlyCafe. The 4.7M-view Day 1 has an "UP NEXT: …" caption 10 s before every move, so key moments are complete.
  - **Chloe Ting**: nothing in the description; key moments cover most moves; FitlyCafe has all with the 5/10/15 s rest pattern. chloeting.com program pages embed the videos but not the exercise lists (client-rendered, needs login for details).
  - **Pamela Reif**: description says only "30s for each exercise"; no on-screen text captured by key moments (0 for every video). FitlyCafe lists are consistent with the video lengths to within 30 s.
  - **MadFit**: dance videos list the songs with timestamps (nothing finer exists); the beginner workout has 11 key moments that anchor FitlyCafe's set structure.
  - **Fitness Blender**: site page + key moments give a complete, timestamped picture. The "Ultimate HIIT" page lists 40 moves but the captions show 39 (no "3 Squat Jacks + Jump").
  - **Yoga With Adriene**: no pose lists anywhere official; FitlyCafe pose lists + cue-style key moments give the order and rough timing.
  - **Joe Wicks**: skipped. No exercise list in any description, PE With Joe descriptions are one line, key moments cover ~70 % of moves, and no third party has typed them up. Needs a transcript or a human watch.

## Modelling
- Every video is a `rounds` block (or several) of `forMode: seconds` steps with rest steps; `startSeconds` on the exercise step. 28 files, 0 errors.
- **Derived timestamps.** Where the creator's grid is fixed (Pamela 30 s no breaks from 0:00; growingannanas 50/10 from 0:00; Fitness Blender 40 s + 15 s jog pairs) `startSeconds` is computed from the "starts at" anchor and flagged in the block `note` ("derived … may drift a few seconds"). The app should treat `startSeconds` as a seek hint, not a cue.
- **Yoga has no intervals.** Poses run for as long as Adriene talks; durations here are estimated segment lengths that sum to the video length, and `startSeconds` is set only where a key-moment cue clearly marks the pose. A yoga step really wants `forMode: "untimed"` and a `startSeconds`/`endSeconds` pair driven by the video, with no timer at all.
- **Dance videos** are one step per song (`bw_dance_cardio`, 1.5–4.5 min). There is no meaningful exercise granularity; the runsheet is just a song list with seek points.
- **Warm-ups and cool-downs** that the creator does not itemise are single `bw_warm_up` / `bw_cool_down` steps spanning the segment (Heather, Sydney, Fitness Blender 37-min). Sydney's cool-down lengths are inferred from the chapter to the video end.
- **Repeated circuits with round-1 timestamps** (Heather strength ×2, Sydney circuits ×3, Fitness Blender pairs ×2, Caroline sets ×3): `repeat` on the block and `startSeconds` only valid for the first round. A follow-along player needs either per-round offsets or to compute `startSeconds + round × blockDuration`.
- **Left/right sides** are separate steps with "right"/"left" in `note` (Chloe, Pamela, Heather, Sydney all time them separately). A `side` field would be cleaner than notes.
- **Combo moves** ("deadlift + overhead lunge", "squat curl + press", "lunge, knee drive and back leg lift") are mapped to the dominant movement's key with the combo in `note`. ~40 % of Heather/Sydney/growingannanas steps are combos; the library cannot express them and the note is doing the work.
- **Caroline Girvan loads** are her stated kg per hand, stored as `target` with the library's `kg per arm` unit; single-dumbbell moves (goblet, pullover with one bell) still use the per-arm key. No `rx` since she gives one number.
- **Active rest** (MadFit "keep marching", Fitness Blender "jog/boxer shuffle", Chloe's 5-second gaps) is a plain rest step; the instruction lives in the block note.
- Reused existing keys where they matched: NHS `bw_march`, `bw_stretch_*`, `bw_cobra`, `bw_grapevine`, `bw_step_up`, `bw_side_lying_leg_raise`, `bw_donkey_kick`, `bw_bench_dip`, `bw_knee_pushup`, heroes `bw_bear_crawl`, `bw_hand_release_pushup`, `bw_broad_jump`, `db_deadlift`, `db_front_squat`, `db_renegade_row`, protocols `bw_high_knees`, programs `db_chest_fly`. NHS `bw_child_pose` is named "Bottom to heels stretch", so yoga got its own `yoga_child_pose`.
- 88 new keys, mostly bodyweight HIIT vocabulary (`bw_in_out_squat`, `bw_skater`, `bw_plank_jack`, `bw_up_down_plank`, `bw_crab_toe_touch`, `bw_heisman` …), 24 `yoga_*` poses (group `body`), and generic `bw_dance_cardio`, `bw_warm_up`, `bw_cool_down`.

## What a follow-along needs from the app
- **Embed the video and drive the runsheet from the player's time**, not from our timer: the video already has the countdown, the "next up" card and the coach. Our list is a table of contents (seek to step, show what's next, log completion), so `startSeconds` should be a seek target and highlighting should come from `player.currentTime`.
- No app timer, no auto-advance, no rest countdown; if the video is paused the runsheet pauses.
- For steps without `startSeconds` (Caroline, Sydney bodyweight, Adriene 10-min) fall back to cumulative duration from the block start, i.e. the derived grid, and say so.
- Block `repeat` must expand per round for video sync (round n offset = `startSeconds` of round 1 + n × block length).
- Yoga and dance want a "segment" step type: no `forValue`, just `startSeconds`, `endSeconds` and a label.
- Show the creator's on-screen names in `note` next to our library name; "Heisman" or "Kneeling-up side walks" is what the viewer sees on screen.
- Views/popularity belong in `description`; consider a `source.views` + `source.fetchedAt` field so the number can be refreshed.

## Skipped
- Joe Wicks (all): 20 Minute Full Body (4.4M), 20 Minute Fat Burning Cardio & Abs (6.5M), PE With Joe 23/24 March 2020 (8.1M / 4.6M), 7 Minute Abs Blaster (4.4M), 20 Minutes 20 Exercises (2.0M): sequence recoverable for only 65–85 % of the moves.
- Sydney Cummings 30 Minute Fat-Burning HIIT (4.8M): no list, key moments partial.
- Heather Robertson NO REPEAT with Weights (6.4M) and 1 Hour No Repeat (5.4M): no breakdown in the description; key moments 0 / 47 of 60.
- Chloe Ting 11 Line Abs (82M), MadFit One Direction Dance Party (12M), growingannanas Tabata (1M): no list anywhere.
- Fitness Blender Butt & Thigh (10M): list exists, not imported to keep the total at ~3 per creator.

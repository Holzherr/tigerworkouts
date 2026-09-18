# What importing 472 public workouts taught us

Consolidated from the per-source LEARNINGS files (6 Sep 2026). Counts from `tools/validate-imports.mjs`.

| Source | Workouts | Notes |
|---|---|---|
| crossfit-girls | 36 | all canonical Girls incl. the 2021 batch; Naughty Nancy / Cindy XXX variants skipped |
| crossfit-heroes | 249 | every Hero on crossfit.com (CMS JSON endpoint: `cms-api.crossfit.com/tiles?content_type=benchmark`) |
| crossfit-open | 70 | 11.1 to 26.3; Rx men/women, scaled in notes; 18.0 skipped |
| nhs | 30 | 17 NHS workouts (most now only on Wayback) + all 27 Couch to 5K runs as 13 files |
| programs | 34 | StrongLifts, Starting Strength, GZCLP, PPL, PHUL, nSuns, 5/3/1, BWF RR, GreySkull, Ivysaur |
| protocols | 25 | 7-minute, Tabata ×5, EMOM ×3, Hyrox race + 3 sessions, ACFT/RFT/Cooper/USMC PFT, Filthy Fifty, FGB, Chief, Death by Burpees, Sally |
| youtube | 28 | 9 creators; Joe Wicks skipped (no recoverable exercise list) |

277 new exercises came with them (from 72). Block modes used: rounds 346, for-time 347, AMRAP 97, ladder 34, EMOM 5. Step modes: reps 1671, seconds 817, metres 328, minutes 42, calories 25, max 12.

## What the model handled well

- **Rounds / intervals / sets×reps** (NHS circuits, programs, Tabata, C25K): direct fit. C25K is warm-up walk → block ×8 [run 60 s, walk 90 s] → cool-down.
- **For time, AMRAP, EMOM, ladders** (added during import): cover ~90% of CrossFit. `mode: ladder` handles 21-15-9, 1-10-1, 33-27-21-15-9 and the 3-6-9 AMRAP ladders.
- **Rx loads** as `target` (men) + `rx {men, women}` in kg. Distances in metres, rower/bike calories.
- **Attribution**: `source {title, url, author, kind, license, importedAt}` plus `description` in our words was enough for every source; NHS is OGL, CrossFit benchmarks are public, videos are linked not copied.

## What did not fit (in order of how often it bit)

1. **Scores that aren't time.** FGB (total reps), Tabata (lowest round), Cooper (distance), 1RM/3RM (load), "for load" Girls, AMRAP (rounds + reps), ACFT events. Only time-based blocks have an implicit score. → `score: 'time' | 'rounds' | 'reps' | 'load' | 'distance'` on a block or runsheet, and a place to log the result.
2. **Workout-level clock.** Open workouts with one cap across several dissimilar blocks (17.1, 21.1, 22.3), buy-in-then-AMRAP Heroes (Finseth, Tiff, Wesley), fixed-timestamp timelines (Dominic J. Hall). Caps sit on the first block with a note. → `timeCapSec` on the runsheet and "shared clock" across consecutive blocks.
3. **Progression and percentages.** Every program: +2.5 kg on success, deload after 3 fails, 5/3/1 percentages of a training max, "5+" AMRAP last sets that drive the next session. `targetPct` exists now but there is no per-user training max, no `progression` rule, and no AMRAP-set logging. → user TM store, `forMode: amrap` on sets, block `progression {onSuccess, onFail, deloadPct}`.
4. **Uneven ladders.** One movement climbs while another stays fixed (17.1 snatches 10→50 with 15 box jump-overs; 21.1 wall walks n / double-unders 10n; crossing ladders 10-1 / 1-10). Ladder scales every reps step equally. → per-step `ladderFactor` or `fixed: true`.
5. **Death by / "every X min add reps"** (14.2, 15.2, Death by Burpees): ladder + clock. → `mode: deathby` = ladder with `everySec`, stop on a failed rung.
6. **Cycles with rest** (The Chief: 5 × [AMRAP 3, rest 1], Tabata This, "rest 3 min between rounds"). Blocks can't repeat with a rest *between* repeats; trailing rest steps add a pointless rest after the last round. → `restBetweenSec` on blocks.
7. **Warm-up / cool-down / shared routines.** NHS and every video have them; C25K walks are loose steps; the NHS 6-min warm-up is its own runsheet referenced in prose. → `role: warmup | main | cooldown` on items and the ability to embed another runsheet by id.
8. **Follow-along videos.** `startSeconds` is a seek hint, often derived from a grid rather than a cue; repeated circuits only carry round-1 times; yoga and dance have no intervals. → an untimed "segment" step (start/end in the video) and a player mode where YouTube is the clock, not our timer.
9. **Combo moves and sides.** "Squat curl + press", "deadlift + overhead lunge" map to the dominant movement with a note; `perSide` now covers L/R but Open counts 5 L + 5 R as 10. → composite steps, or accept notes.
10. **Partner / team formats, penalties, relative loads** (7 partner Heroes, Coffland's per-drop penalty, ¾ BW, "rest as needed"). Notes only. `loadFactor` now covers × bodyweight. Partner sync and penalties are out of scope for a personal app.
11. **Units.** Imperial distances (ft/yd bear crawls), lb→kg rounding that doesn't land on real plates (95 lb → 43 kg; gyms load 40 or 45), kettlebells in pood. Keep kg and let the picker snap to the nearest real load per equipment.
12. **Rep and time ranges** ("15 to 24 reps", "hold 5 to 10 s"): `forMax` added; steppers and timer don't use it yet.

## Sourcing notes for next time

- crossfit.com: list pages are JS-rendered; use the CMS tiles endpoint or `/benchmark/<slug>` pages. games.crossfit.com per-workout pages accept `?division_category=1|2&scaled=0|1|2`.
- wodwell.com returns nothing to headless fetches.
- nhs.uk has removed most workout pages; Wayback 2019–2022 snapshots carry the OGL text.
- thefitness.wiki dropped several program pages; reddit and most training sites are bot-gated; Wayback and program-app reproductions (liftosaur, repcheck) filled the gaps, cross-checked against the spreadsheets.
- YouTube: descriptions vary by creator; "key moments" are OCR of on-screen text; fitlycafe.com hand-types Pamela Reif's sequences. Joe Wicks has no recoverable lists.
- Run agents in separate scratch folders: two importers overwrote each other's generator scripts in the shared scratchpad.

## Build list, in order

1. Score type + result logging (unblocks CrossFit benchmarks, tests, and program progression).
2. Runsheet-level time cap and rest-between-repeats.
3. Warm-up/cool-down roles and embedded runsheets.
4. Training-max store + `targetPct` resolution in the picker/timer; AMRAP sets; progression rules.
5. Death-by mode and per-step ladder factors.
6. Video segment steps and a YouTube-clock player.
7. Discover: source filters (benchmark / program / video / NHS), program pages with day order, "From <source>" attribution on cards.

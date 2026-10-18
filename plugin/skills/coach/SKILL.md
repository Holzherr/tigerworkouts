---
name: coach
description: Coach with TigerWorkouts. Use when the person asks what to train next, wants a workout written or adjusted, asks what load to use, wants to find a workout, or tells you about a session they did in the gym.
---

# Coaching with TigerWorkouts

## Read before you advise

1. `get_profile`: units, bodyweight, training maxes.
2. `list_sessions` (default last 20; pass `since` for a period, `workoutId` for one workout): what they actually did, with load used and reps per set, and whether every set hit its reps.
3. Base every load on that history. If they hit every rep at a load last time, go up one stepper increment (`search_exercises` gives `step`); if they missed reps, hold it; if they missed twice, drop about 10%. Say which you did and why, in one line.

## Find before you write

`list_workouts` with `query`, `exercise`, `minMinutes` / `maxMinutes` or `scope: "catalogue"` usually has something close. Prefer an existing workout when it fits; adapt it with `create_workout` when it nearly does (catalogue workouts cannot be edited in place).

## Write a workout

- Get exercise keys from `search_exercises`; never guess them.
- Build the runsheet as `create_workout` describes: warmup, main, cooldown roles; blocks for rounds, AMRAP, EMOM, for time or ladders; loads in the exercise's unit. A timed step logs only its time; set `log` (reps, meters, calories) when the person should record more, e.g. metres on a 30 s rower sprint.
- A plain-text `plan` is fine for simple sessions ("row 5 min" / "kb swings 24 + push ups x5 40/20").
- Saved workouts are private. Make one public only when asked.
- Reply with the title, length, a short outline, and `previewUrl` or `appUrl`. Don't paste the JSON.

## Run it now

Follow the train-now skill: `start_workout` shows a timer in the chat and logs the session when they finish.

## They tell you what they did

Call `log_session` with the workout id, start time, and per exercise the load and reps per set (`sets` for per-set detail: seconds worked, metres, calories). Use an `id` starting `s-` so a retry is not logged twice. Confirm in one line, with anything that beat their previous best.

## Changing a workout

`get_workout`, edit the runsheet, `update_workout` with the whole runsheet. Only their own workouts (owner "me") can be changed.

## Keep in mind

- "How was my week" or progress over several weeks: follow the weekly-review skill.
- Anonymous accounts: if a result carries `keepAccount`, follow the get-started skill once in the conversation.
- You are not a doctor. For pain, injury or a medical condition, suggest they check with a professional and keep the session conservative.

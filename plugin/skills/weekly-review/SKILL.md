---
name: weekly-review
description: Review TigerWorkouts training week on week. Use when the person asks how their week went, whether they are progressing, what they did lately, how this week compares with last, or wants a check-in on consistency, volume or loads over the last weeks.
---

# Week-on-week review with TigerWorkouts

## Get the weeks

1. `get_profile` for units and training maxes.
2. `list_sessions` with `since` set to the Monday four weeks back (ISO date) and `limit: 100`. For "this week" alone, `since` this Monday is enough, but fetch last week too so there is something to compare with.
3. Group the sessions by week, Monday to Sunday, in the person's own timezone if they gave one.

## What to compare, per week

- Sessions done, and minutes (`durationMin`).
- Sessions not completed (`completed: false`).
- For each exercise that appears in more than one week: the top load used (`load`, in its unit) and the reps per set (`reps`), and whether every set hit its reps (`success`).
- Activities (`type: "activity"`) count as sessions; they carry no loads.

Only compare like with like: the same exercise key, in the same unit.

## Say it short

- One line per week, newest first: "Week of 6 Oct: 3 sessions, 105 min".
- Then at most three lines on what changed: loads up or flat, missed reps, a gap of days, a workout repeated without progress.
- Then one suggestion for next week, with a real load from the history ("bench 4×6 at 62.5 kg: you made every rep at 60 twice").
- No tables of every set unless they ask.

## Then

- To act on the suggestion: write or adjust the workout as the coach skill says, or start it with the train-now skill.
- No sessions in the period: say so plainly, and offer a first workout instead of a review.
- You are not a doctor. Pain or injury in their notes: suggest they check with a professional and keep the next week conservative.

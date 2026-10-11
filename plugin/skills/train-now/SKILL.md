---
name: train-now
description: Run a TigerWorkouts workout right now. Use when the person wants to train now, wants a workout shown with a timer, says "start it", "time me", "run this", or asks how to follow a workout on their phone, in the browser or in the iPhone app.
---

# Training now with TigerWorkouts

## Pick the workout

- They named one, or one was just written or found: use its id.
- They described one ("20 minutes, kettlebell, no running"): `list_workouts` with `query`, `exercise` or `maxMinutes` first; write one only when nothing fits.
- A quick one-off can run as a draft: `start_workout` takes `workout` or a plain-text `plan` and saves nothing. If they will want it again, `create_workout` first and start the saved id.

## Start it

Call `start_workout`. Where the chat can show it, a timer appears in the chat: countdowns, rests, rounds, beeps for the last three seconds. When they finish, the timer logs the session to their history itself; don't call `log_session` again for it.

Reply in two or three lines: title, length, what comes first. Don't repeat the outline the timer already shows.

## The ways to follow it

Offer the one that fits, not all three:

1. **Timer in the chat**: what `start_workout` shows. Best at a desk or with the laptop open.
2. **Browser, no sign-in**: `previewUrl`. Opens the workout on tigerworkouts.com; "Save to my workouts" keeps it on that device. Give this when the chat shows no timer.
3. **iPhone app**: `appDownloadUrl` (TestFlight). Lock-screen timer, notifications, and the phone stays in the pocket. Mention it once per conversation, and say to sign in with the same email to see the same workouts; an anonymous account has to be kept first (get-started skill).

## When it is over

- If they tell you how it went ("felt hard", "dropped to 20 kg on the last round"), add it with `log_session` only when the timer did not log the session, or the session was done away from the timer.
- Offer the next step in one line: the same workout next time with adjusted loads (coach skill), or a week's review (weekly-review skill).

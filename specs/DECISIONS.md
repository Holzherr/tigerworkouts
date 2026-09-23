# Decisions

Append-only. One line per decision: `- <date> <who>: <decision>`. Builders append Nick's answers here in their PR; nobody rewrites history.

- 2026-09-06 Nick: rebrand from Workout Hub to TigerWorkouts; coral #ff4d2e, traced tiger mark V6, striped app icon.
- 2026-09-10 Nick: block gate, rest colour, loads carry over between sessions, no quick log, Saved first on the home screen.
- 2026-09-18 Nick: own repository with history; v0.9 kept under legacy/ until parity.
- 2026-09-22 Nick: iOS icon and in-app mark are two straight flat coral bars, #ff4d2e, with explicit dark and tinted icon variants; the web mark stays until the web-brand question is answered.
- 2026-09-23 Nick: numbers on a workout (weight, reps, time, rests, rounds, incline) are *your settings* for it, never a new workout, with Reset to original; any structural change on a workout you don't own makes your own version, `derivedFrom` the original and private. Workouts written from scratch are private too; every owned workout has a public/private toggle. Supersedes the 22 Sep "silent private copy". Spec: specs/workout-settings.md.
- 2026-09-23 agent: precedence for weight/speed/incline at start — a session of this workout done after the setting was saved > the saved setting > older sessions of this workout > the same exercise in other workouts > as written. Reps, rests and rounds come from settings only.
- 2026-09-23 agent: sync never flips a workout's visibility — the pushed `public` is the workout's own, else the row's current value, else false.

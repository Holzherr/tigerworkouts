Status: built

# Workout versions

One base workout per idea; the changes a person makes for one session are kept with that session as
their version, privately, never as a workout of their own. Nick, 19 Oct 2026, approved ("yes go").

## Why

Nick: "keep one as base - but our model should allow people to make edits and have those workouts
saved as variants the user has done - but these are not published". Changing a workout for one
session (swings first because the bell is taken, an extra exercise) either changed the workout for
good or, by duplicating it, left two near-identical workouts in the list (Nick's own list had one).

## Decisions

1. **One base per idea.** The workout is the base: the one in the list, the one others see if it is
   public. Nothing about versions is ever published.
2. **A session keeps what it ran.** `SessionResult.version?: { items }` on the session's own row
   (`sessions.data`, jsonb, no migration), written only when the run differs from the workout as the
   app would have started it. Loads the app filled in itself (last time's, a programme's step, a % of
   a training max) are put back to the base's before comparing, so a normal session has no version.
   ids do not count.
3. **"Your versions" on the workout page**, under the rows on the web, above them on iOS: one row
   per distinct version, newest first — what changed ("Swings first · + Romanian deadlift", at most
   three parts), how often, when last — with **Run** (runs it again; that session keeps it as its
   version) and **Make base** (the version becomes the workout). A version that matches the base is
   not listed. Only the person who ran them sees them.
4. **Edit asks once** per visit, on a workout that has been done at least once: **Just this time**
   (the change stays on the page, unsaved; Start runs it; a banner offers "Update workout instead" and
   "Undo changes") or **Update workout** (changes the base, as before). Never asked on a workout not
   yet done.
5. **A duplicate folds in** (web, ⋯ "Make it a version of another workout"): its sessions move to
   the workout picked, each keeping what it ran as its version; the duplicate is deleted and a
   bookmark moves to the base.
6. **iOS** also keeps changes made mid-session (the timer's Session sheet) as the version, since
   it compares the sheet the timer ended on. The web compares what Start ran.
7. **MCP:** `list_sessions`/`get_session` show a session's `version` (changes and outline);
   `get_workout` lists `versions` with a `sessionId`; `start_workout` takes `sessionId` to run one
   again and the timer logs it with `log_session`'s optional `version`.

## Where

`src/features/runsheet/versions.ts` (port: `ios/TigerWorkouts/Model/Versions.swift`, all but
`mergeSessions`); web UI `src/features/discover/components/workout-versions.tsx`; iOS
`WorkoutDetailView` and `RootView.logOnFinish`; MCP `mcp/src/tools.ts`.

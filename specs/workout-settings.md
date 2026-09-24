Status: building

# Workout settings, your own versions, private and public

Nick, 23 Sep 2026: "we need private and public workouts. Important to differentiate between setting
updates on weights (which is not a new workout — saving your settings on a workout) vs. a new setup."
Replaces the 22 Sep "silent private copy" decision.

## Two kinds of change

| | Settings | New setup |
|---|---|---|
| What | numbers only: weight/speed (`target`), incline, reps or time (`forValue`), a rest's `seconds`, a block's `repeat`, `timeCapSec`, `everySec`, `restBetweenSec` | anything else: add, remove, reorder, group/ungroup, a permanent exercise swap, rename, description, icon |
| Where it goes | *your settings for that workout*, keyed by workout id + step/block id | your own workout: saved in place. Anyone else's (catalogue, coach, someone's public one): a new workout owned by you, `derivedFrom` the original, **private** |
| The original | untouched | untouched |
| Browse lists | never (it is not a workout) | only yours, unless you make it public |
| Undo | "Reset to original" | delete your version |

The classification is a pure function on both sides: `classifyEdit` / `Settings.classify` strips the
setting fields (`shape`) and compares; equal shapes with different numbers are settings.

A new setup on your own workout takes the numbers on screen with it and clears that workout's
settings (they are now in the workout).

## Where a session's numbers come from

`withLastUsed(r, results, settings)` (web) / `Settings.withLastUsed(_:results:settings:)` (iOS).
Reps, rests and rounds come from settings alone. Weight, speed and incline, most specific first:

1. this step in a session of *this workout* done after the setting was saved
2. your saved setting for this step
3. this step in an older session of this workout
4. the same exercise in any other workout, most recent
5. the workout as written

So a saved setting beats everything older than it and anything carried over from other workouts;
doing this workout again after saving moves the number on. Last-used keys are now
`step:<workout id>:<step id>` — catalogue step ids ("s1") repeat across workouts and used to leak.

## Private and public

- Every workout you own has a visibility toggle on its page ("Private · only you see it" / "Public ·
  shows in Discover"). Written from scratch, imported from a share link, or made as your own
  version: private.
- Supabase `workouts.public` is the truth. Pulls read the column; pushes send the workout's own
  `public`, else the value the row already has, else false. A push never flips a row by itself.
  Rows written before this change were all written `public: true`, and stay so until toggled.
- Built-in catalogue and coach workouts are read-only content.

## Storage (no migration)

- Web: localStorage `tiger:workout-settings:v1` (new key; existing keys untouched).
- iOS: `workoutSettings` in `tiger-cache.json`.
- Server: `user_state.prefs.workoutSettings` — `{ [workoutId]: { updatedAt, steps: { [id]: { target?, incline?, forValue?, seconds?, at } }, blocks: { [id]: { repeat?, timeCapSec?, everySec?, restBetweenSec? } } } }`.
  Merged per workout, newest `updatedAt` wins. A reset is an empty entry so it reaches other devices.

## UI

- Web workout page: every number is editable where it is read (exercise sheet: weight, incline,
  reps/time; rest rows; the block's rounds chip). Each sheet says "Saved as your settings for this
  workout. The original stays as written." A banner "Your settings are on" carries Reset to original.
- Web editor (Edit): the subtitle says what Save will do before you press it — "Numbers only · saves
  as your settings", "Saves as your own version (private)", "Saves to your workout"; the button reads
  Save settings / Save my version / Save.
- iOS workout page: numbers save as settings at once (same note in the sheets; "Your settings"
  banner with Reset to original). A new setup on someone else's workout shows "Changed for this
  session · Keep it as your own version — private to you" with Save my version.

## Not yet

- iOS WorkoutEditorView (own workouts' name/blocks/rounds sheet) still saves everything into the
  workout, numbers included.
- No "Your versions of X" link from the original's page.

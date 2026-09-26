Status: building

# Unified editing

One way to edit a workout: the same rows, steppers and press-and-drag before a session and during
it, on the phone and on the web. Item TW-006; decisions Nick's, 2026-09-22 (board).

## Why

Nick, gym 2026-09-20 and 2026-09-22. The phone had three places to edit a workout — the workout
screen, a separate editor form, the timer's exercise sheet — each with its own controls; only one
of them reorders anything; and once a session starts, rounds, rest, durations and order are frozen.
He wanted to drag blocks and exercises, edit the next block mid-session, jump to another block
when the kit is busy, add an exercise from the edit screen, and stop edited copies flooding what
Discover and Saved show.

## Decisions

1. **One editor: the workout screen.** It already edits in place (drag steps inside a block,
   swipe to remove, tap a row for its sheet). It gains block settings, add-a-block, add-a-one-off
   exercise, the name and creator, and delete. The separate editor form (`WorkoutEditorView.swift`)
   goes; ＋ on the Workouts tab opens a new, empty workout on the workout screen.
2. **Press-and-drag, no handles** (DESIGN.md). A step moves within and between blocks and to the
   top level; a block, and a loose step, moves by its header. The web keeps variant B — `pointer`
   in `runsheet-list.tsx`, the insertion line follows the finger — because it is what iOS `onMove`
   does; Classic, A (`seams`) and C (`buttons`) go, and the `tiger:dnd` setting with them.
3. **Mid-session, what is coming is editable.** Below the running block the timer shows every
   block still to come, with the same rows and steppers as the workout screen: rounds, rest between
   rounds, step durations and order, and the order of the blocks. Dragging an upcoming block to the
   top of that list makes it the next one — that is the jump when a machine is busy. The engine
   replans from the cursor and keeps what is done; the rule is below, in Swift and TypeScript one
   for one.
4. **Editing a catalogue workout makes a silent copy.** The first edit on a catalogue workout's
   screen copies it (`Edit.duplicate`: new id, fresh step ids, `source.kind: user`) and saves the
   copy as yours; the screen switches to the copy and every later edit lands there. The "Changed for
   this session" banner and "Save as mine" go.

## The one editor

| Row | Tap | Drag | Swipe |
| --- | --- | --- | --- |
| Exercise step | its sheet: load, incline, how long or how many, remove, swap | moves within or between blocks, or out to the top level | remove |
| Rest step | its sheet: seconds, remove | same as a step | remove |
| Block header | its sheet: name, runs as, rounds or minutes or cap, rest between rounds, remove block | moves the whole block | — |
| Title | name and creator | — | — |

Under each block: Add exercise, Add rest. Under the list: Add block, Add a one-off exercise. Delete
workout in the ⋯ menu, with the same confirmation the form had.

Every place that edits a workout uses these rows: the workout screen before a session, and the
timer's list of upcoming blocks during one. The per-step sheet is `ExerciseSheet` in both.

## Mid-session

The timer shows the running block as it does now. Below it — under the scroll is fine — the
blocks still to come, as the editor rows above. Nothing about the running block changes there:
its rounds, rest and order are set for this session; Skip and Finish are how you leave it early.

### The engine rule: `replan`

`Runner.replan(state, runsheet, now)` in `Runner.swift` and `replan(state, runsheet, now)` in
`runner.ts`, with the same tests under the same names.

- `done`: nothing changes.
- `lead` (the five-second count-in): every slot is rebuilt from the edited sheet.
- `ready` (parked at a block gate): slots before the cursor are kept; the parked block and
  everything after it are rebuilt, so the block you are looking at can change before you start it.
- `running` or `paused`: slots up to the end of the running part are kept — its later rounds
  included — and every item after it is rebuilt from the edited sheet, in the sheet's order.
- Kept slots keep their ids and their actuals: loads, inclines, reps, done times. Rebuilt slots get
  fresh ids, so an actual can never land on the wrong slot.
- What carries into the rebuilt slots: dropped steps stay dropped, a step swapped with
  `Runner.swap` keeps the swapped exercise and load, and a load set ahead from the overview lands
  on the step's first rebuilt slot.
- An item already done or running is never run again, even if the edit moved it later in the
  sheet.
- `part` and `parts` are renumbered so "Block n of m" reads right and the block gate still parks
  the timer at each new part.

`SessionRunner.edit(runsheet)` applies it and keeps the edited sheet as the session's. The web
timer gets the same call when its upcoming-blocks list is built (not in the items below).

## Keeping copies out of the stream

A copy is a version of something already in the catalogue, not new content. Discover never lists
your copies; Saved shows the copy in place of the original it was made from (saving as mine already
moves the bookmark); My workouts lists them. One copy per original per account: an edit on the
original's screen when a copy exists updates the copy and switches to it, so a workout edited on
three gym days is still one workout.

## Build items

Two M items, in this order:

1. **The edit surface (iOS and web).** The workout screen as the one editor per the table above;
   block header drag and step drag between blocks; the editor form removed and ＋ rerouted; the
   silent copy and the one-copy-per-original rule; on the web, variant B kept and the others and
   the `tiger:dnd` setting removed. Proof: the "write a workout" walkthrough rewritten for the
   workout screen, screenshots of a step and a block moved.
2. **The live session.** `replan` in both engines with the same tests (landed with this spec);
   the timer's upcoming-blocks list, editable in place, with block drag for the jump; the web
   timer's list. Proof: RunnerTests and runner.test.ts, the "run and finish" walkthrough with a
   round added mid-session.

## Built (2026-09-26)

- iOS: `RunsheetEditor` is the one editor, used by the workout screen and the timer's Session sheet.
  One flat list: a step drags within or between blocks or out on its own; a block drags by its
  header (`Edit.rows` / `Edit.moveRow`, EditingTests). Tap a header for rounds and rest
  (`BlockSheet`). `WorkoutEditorView` is gone; ＋ opens the workout screen. The ⋯ menu is "Edit":
  name and creator, duplicate, open the original, delete. A catalogue workout's first edit makes a
  silent copy. Mid-session, done and running blocks are greyed and fixed; the rest edit and drag
  through `SessionRunner.edit`.
- Not yet: the web editor (variant B only, blocks and rounds on the workout page), one copy per
  original, keeping copies out of Discover.

## Out

The catalogue and `imports/`; sync and the sessions row format; Health; the Live Activity; load
and incline seeding (TW-005); editing the running block's own rounds, rest or order.

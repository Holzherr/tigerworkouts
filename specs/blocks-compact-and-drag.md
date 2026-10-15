Status: built

# Blocks: compact sets and an obvious drag

Nick, iOS app, 2026-09-29 (Claude Code): "When I try to drag a block it doesn't make it obvious how
to drag block. Blocks can be too large now - if I have 8x reps of 30seconds on 20kg it shows 8
lines, when the block rep 8x would be more efficient use of space. Improve presentation and also
drag/drop of blocks."

Mockup: https://claude.ai/artifact/K2JvQ2mxAhFrpeNhTsnMNC (now, then 1–3 below).

## What is there now

- A block done as sets (`Block.straightSetStep`) draws `SetPlanGrid`
  (`ios/TigerWorkouts/Features/SetGrid.swift`; web `set-grid` in `runsheet-list.tsx`): one row per
  round, each with its own load and count steppers. 8 identical sets = 8 rows.
- A block moves by press-and-drag on its header (`RunsheetEditor.blockHeader`, `Edit.moveRow`).
  The header is plain text with nothing that says it moves. DESIGN.md: "No drag handles. Rows move
  by press-and-drag; blocks by their header." (TW-006 decision 2.)
- During a header drag, iOS `List.onMove` lifts only the header row; the block's steps stay put
  until the drop, so it doesn't look like the block is moving.

## Items

### 1. Identical sets fold into one row

- Consecutive sets with the same type, load and count show as one row: `8×  [− 20 +]  [− 0:30 +]`.
  A stepper on a folded row changes every set in it.
- Sets that differ split into runs: `W 1  40 kg × 12`, then `4×  60 kg × 8`.
- `+ Set` / `− Set` add or drop a set at the end of the last run; "Vary sets" opens today's
  per-set grid for that block. The grid folds back when the runs are uniform again.
- The exercise row's summary reads `8 × 30s · 20 kg` (web and iOS alike).
- Same in the timer's upcoming-blocks list and on the web editor; the Swift and TypeScript grouping
  are one function each, with the same tests.
- Done when: a block of 8 identical sets takes one set row on both apps; editing it edits all 8;
  a warm-up plus 4 working sets shows two rows; "Vary sets" still reaches every set.

### 2. Block headers show they move

- A grip
  (three lines) at the right of each block header, 44 pt target (Nick approved the mockup 2026-09-29, which reverses DESIGN.md "no drag handles" for blocks); press-and-drag on the whole header
  still works.
- A one-time tip on the workout screen: "Hold a block's header to move it". Dismissed with OK, and
  not shown again.
- Accessibility: keep the hint; add Move up / Move down as accessibility actions on the header.

### 3. The whole block moves as one — the reorder view

Status: built (TW-026 and TW-034, 2026-10-15). The first plan, every block folding to a card while
one drags in the editor, needed a SwiftUI press-then-drag inside a List, which never took the drag
on the simulator (LEARNINGS 2026-09-30). Nick said yes to a separate reorder view instead.

- Tapping a block header's grip opens "Reorder blocks": every block (and loose step) as one line
  card — name, exercise count, sets or rounds, time. Drag a card to its new place; Done applies
  the order, Cancel drops it. Each item moves whole, so a block keeps all its steps.
- iOS: a plain List in edit mode with `.onMove` (`BlockReorderView`, `Edit.moveCard`), a haptic on
  each drop (the lift is the system's own). Web: `BlockReorder` with pointer drag and the coral
  insertion line (`block-reorder.tsx`, `moveItemClamped`).
- Press-and-drag on a header in the editor still moves the block as before.
- Mid-session (TW-034): done and running blocks show fixed at the top of the reorder view, with a
  lock and no drag control. A block dropped above them — in the reorder view or by its header on
  the Session sheet — lands right after the running block, and a line says "Moved to next — done
  and current blocks stay put". Before, the drop snapped back silently: SwiftUI refuses every drop
  onto the slot of a row marked `moveDisabled`, so the editor's done and running rows are no longer
  marked; `Edit.moveRowClamped` keeps them in place and dragging one of them says "Done and current
  blocks stay put".
- The web has no mid-session editing yet; `BlockReorder` takes `locked` for when it does.
- Done when: on the phone, start a workout, finish block 1, tap a block's grip, drag block 3 to
  the top: it lands after the running block with the line above. Proof: EditingTests
  (`clampAboveLocked`, `reorderCards`), `testBlockReorderView`, `block-reorder.test.tsx`.

## Not in scope

- The running block during a session (TW-006: its order is set for the session).
- Changes to how steps drag.

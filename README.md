# Workout Hub (next)

React rebuild of `../workout-hub` as a component library first, app second. Every visual piece is a
Storybook "brick" (props in, callbacks out, no data fetching) so it can be reviewed and iterated
in isolation before it touches real data. Conventions mirror GitLaw's front-law repo.

- **App:** https://holzherr.github.io/nick-prototypes/workout-hub-next/
- **Storybook:** https://holzherr.github.io/nick-prototypes/workout-hub-next/storybook/

The v0.9 single-file app at `/workout-hub/` keeps running until this one reaches parity, then the
paths swap.

## Stack

React 19 · TypeScript · Vite · Tailwind 4 (tokens in `src/styles/tailwind.css`, documented in
`DESIGN.md`) · Radix primitives (Select, Dialog) · dnd-kit · lucide icons · Storybook 10
(react-vite) · Vitest.

## Layout

```
src/
  shared/components/ui/     primitives: Button, Chip, Stepper, Dropdown, Sheet, Card, TabBar, ClipThumb
  shared/utils/             cn(), formatters
  features/runsheet/        the editor
    model.ts                pure data model + edits (tested)
    fixtures.ts             Priyanka's circuit and friends, for stories/tests
    components/             StepRow, BlockBracket, AddTile/SeamInsert, SwipeToRemove, RunsheetList, EditorScreen
  App.tsx                   temporary host while screens migrate
```

## Working on it

```
npm run storybook      # component workbench on :6006
npm run dev            # the app on :5173
npm test               # model tests
npm run check-types
npm run build && npm run build-storybook   # what CI does; output in dist/
```

Story conventions (from front-law): CSF3, `satisfies Meta<typeof X>`, `title: 'Shared/UI/X'` or
`'Runsheet/X'`, and a `parameters.docs.description.component` that describes the **visual layout**
so the next person (or agent) can find the component instead of rebuilding it.

## Runsheet model

A workout is a list of items. An item is a step (exercise or rest) or a block (name, repeat count,
list of steps). Blocks are made by dropping one step onto another and dissolve when one step is
left. `model.ts` holds every edit as a pure function; `fromLegacy()` converts v0.9 `data.js`
workouts.

## Status

Done: tokens, primitives, runsheet editor with tap-to-expand, swipe-to-remove, drag-to-reorder,
drop-to-group, seam and tile inserts, block repeat editing. Stub: exercise picker (prompt()),
text-to-workout line. Not yet ported: Discover, timer, history, profile, auth/cloud sync.

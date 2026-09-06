# TigerWorkouts (next)

Branded TigerWorkouts on 6 Sep 2026 (was Workout Hub). Brand bricks live in `src/shared/brand/`
(TigerMark, AppIcon, Logo) with stories under **Brand/** in Storybook; the rebrand plan is in
[REBRAND.md](./REBRAND.md).

React rebuild of `../workout-hub` as a component library first, app second. Every visual piece is a
Storybook "brick" (props in, callbacks out, no data fetching) so it can be reviewed and iterated
in isolation before it touches real data. Conventions mirror GitLaw's front-law repo.

- **Live:** https://tigerworkouts.com (built by the workflow in Holzherr/tigerworkouts from this folder)
- **Preview:** https://holzherr.github.io/nick-prototypes/workout-hub-next/
- **Storybook:** https://tigerworkouts.com/storybook/

The v0.9 single-file app (`../workout-hub`) is kept at https://tigerworkouts.com/legacy/ for a
while after the cutover on 6 Sep 2026; it gets no new features.

## Stack

React 19 · TypeScript · Vite · Tailwind 4 (tokens in `src/styles/tailwind.css`, documented in
`DESIGN.md`) · Radix primitives (Select, Dialog) · dnd-kit · lucide icons · Storybook 10
(react-vite) · Vitest.

## Layout

```
src/
  shared/brand/             TigerMark, AppIcon, Logo + the traced mark path
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

## Imported workouts

`imports/<source>/*.json`: 472 public workouts in runsheet form (CrossFit Girls, Heroes, Open,
NHS + Couch to 5K, free lifting programs, protocols, YouTube follow-alongs) with source
attribution, plus 277 exercises they needed. Format in `imports/SCHEMA.md`, findings and build
list in `imports/LEARNINGS.md`. Validate with `node tools/validate-imports.mjs`; browse them in
Storybook under Workouts → Imported. Verbatim originals live in the private assistant repo.

## Status

Live since 6 Sep 2026. Timer (rounds, for time, AMRAP, EMOM, ladders, resume after reload),
Supabase sign-in and three-way sync (sessions, own workouts, favourites, prefs, custom
exercises; v0.9 rows preserved), editor with drag-to-group and text commands, 472 imported
workouts, scores and progression, follow-along videos, Discover with recommendations, settings,
share links, quick log, offline via a service worker.

Not yet: Google sign-in (provider not enabled), imperial units in the UI (stored only), Fitbit
heart rate is read on the session page but not charted, Storybook stories for every screen state.

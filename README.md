# TigerWorkouts

Creator workouts with a guided timer. Live at **https://tigerworkouts.com**, with a native iPhone
app in [`ios/`](./ios).

Branded TigerWorkouts on 6 Sep 2026 (was Workout Hub). Moved into its own repository on 18 Sep
2026, with its history, from `nick-prototypes/workout-hub-next` (the app) and
`nick-prototypes/workout-hub` (v0.9, now `legacy/`).

## What is where

```
src/          the web app — React, a component library first and an app second
imports/      472 public workouts and the exercises they need; the one catalogue both apps read
ios/          the native iPhone app (SwiftUI) — see ios/README.md
legacy/       the v0.9 single-file app, served at /legacy/; also holds the Supabase schema
tools/        catalogue validation, the v0.9 library port, and the iOS catalogue export
.github/      the build and deploy to tigerworkouts.com
```

- **Live:** https://tigerworkouts.com — the React app (PWA)
- **Legacy:** https://tigerworkouts.com/legacy/ — v0.9, kept after the cutover, no new features
- **Storybook:** https://tigerworkouts.com/storybook/

## Deploy

Every push to `main` builds and deploys (`.github/workflows/deploy.yml`): tests, the app,
Storybook, then `legacy/` copied to `/legacy/`, all to GitHub Pages behind the Cloudflare proxy.
The custom domain is the `CNAME` file. Run it by hand with
`gh workflow run deploy.yml -R Holzherr/tigerworkouts`.

- Backend: Supabase project `icpdzjohsvlpyaluxgbt` (anon key in `src/app/config.ts`; row-level
  security protects the data). Schema in `legacy/supabase/migrations/`.
- Nightly report: `legacy/supabase/migrations/0004_agent_snapshot.sql` adds `agent_snapshot(days)`,
  aggregates only (sessions per day, start origins per owner, top workouts, owner ids), and the
  login role `agent_reader` that can run only that function. Nick applies it and sets the password.
- The service worker keeps navigations network-first, and Cloudflare must never cache `/sw.js` —
  a stale worker is what once stranded a phone on an old build.
- Domain setup, for the record: [SETUP.md](./SETUP.md).

## Stack

React 19 · TypeScript · Vite · Tailwind 4 (tokens in `src/styles/tailwind.css`, documented in
`DESIGN.md`) · Radix primitives (Select, Dialog) · dnd-kit · lucide icons · Storybook 10
(react-vite) · Vitest.

Every visual piece is a Storybook "brick" (props in, callbacks out, no data fetching) so it can be
reviewed in isolation before it touches real data. Conventions mirror GitLaw's front-law repo.
Brand bricks live in `src/shared/brand/` (TigerMark, AppIcon, Logo), stories under **Brand/**;
the rebrand plan is in [REBRAND.md](./REBRAND.md).

## Working on it

```
npm run storybook      # component workbench on :6006
npm run dev            # the app on :5173
npm test               # model tests
npm run build          # tsc -b && vite build — stricter than check-types; run it before pushing
npm run build-storybook
npm run export:ios     # after changing imports/ — regenerates the catalogue the iPhone app bundles
```

Story conventions (from front-law): CSF3, `satisfies Meta<typeof X>`, `title: 'Shared/UI/X'` or
`'Runsheet/X'`, and a `parameters.docs.description.component` that describes the **visual layout**
so the next person (or agent) can find the component instead of rebuilding it.

## Runsheet model

A workout is a list of items. An item is a step (exercise or rest) or a block (name, repeat count,
list of steps). Blocks are made by dropping one step onto another and dissolve when one step is
left. `src/features/runsheet/model.ts` holds every edit as a pure function; `fromLegacy()` converts
v0.9 `legacy/data.js` workouts. The iPhone app runs the same model, ported: the timer engine in
`ios/TigerWorkouts/Engine/Runner.swift` is `src/features/timer/runner.ts` line for line, and has to
follow it when it changes. Mid-session, `replan` takes an edited runsheet and rebuilds every slot
after the running block, keeping what is done (`specs/unified-editing.md`).

## Imported workouts

`imports/<source>/*.json`: 472 public workouts in runsheet form (CrossFit Girls, Heroes, Open,
NHS + Couch to 5K, free lifting programs, protocols, YouTube follow-alongs) with source
attribution, plus 277 exercises they needed. Format in `imports/SCHEMA.md`, findings and build
list in `imports/LEARNINGS.md`. Validate with `node tools/validate-imports.mjs`; browse them in
Storybook under Workouts → Imported. Verbatim originals live in the private assistant repo.

## Status

Live since 6 Sep 2026. Timer (rounds, for time, AMRAP, EMOM, ladders, resume after reload),
Supabase sign-in (email code and Google) and three-way sync (sessions, own workouts, favourites,
prefs, custom exercises; v0.9 rows preserved), editor with drag-to-group and text commands, 472
imported workouts, scores and progression, follow-along videos, Discover with recommendations
(For you lists at most six: workouts by a creator done at least twice, ones sharing two exercises
with your history, saved-not-done, and the next day of a program in progress; a creator done twice
outranks any exercise overlap; For you sends the user to Search when history yields no picks),
settings, share links, quick log, post-workout stats with a body map, offline via a service worker.
Each session records where it was started (`startedFrom`: a Discover tab, the Me tab, Repeat, a
share link) so the share started from a home recommendation can be measured.

Not yet: imperial units in the UI (stored only), Fitbit heart rate is read on the session page but
not charted, Storybook stories for every screen state.

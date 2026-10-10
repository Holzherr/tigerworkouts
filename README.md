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
mcp/          the MCP server for AI assistants (Cloudflare Worker, mcp.tigerworkouts.com) — specs/mcp.md
tools/        catalogue validation, the v0.9 library port, and the iOS catalogue export
.github/      the build and deploy to tigerworkouts.com
```

- **Live:** https://tigerworkouts.com — the React app (PWA)
- **Legacy:** https://tigerworkouts.com/legacy/ — v0.9, kept after the cutover, no new features
- **Storybook:** https://tigerworkouts.com/storybook/
- **MCP server:** https://mcp.tigerworkouts.com — connect Claude or ChatGPT; deployed by hand with `cd mcp && npm run deploy`

## Deploy

Every push to `main` builds and deploys (`.github/workflows/deploy.yml`): tests, the app,
Storybook, then `legacy/` copied to `/legacy/`, all to GitHub Pages behind the Cloudflare proxy.
The custom domain is the `CNAME` file. Run it by hand with
`gh workflow run deploy.yml -R Holzherr/tigerworkouts`.

- Backend: Supabase project `icpdzjohsvlpyaluxgbt` (anon key in `src/app/config.ts`; row-level
  security protects the data). Schema in `legacy/supabase/migrations/`.
- The public key reads nothing private: `0007_public_key_reads_nothing_private.sql` runs the
  exercise views as the caller and takes them from anon, and shows other people only profiles
  with a handle (a creator page needs no more). Contains `revoke`, so Nick applies it by hand.
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
list of steps). Blocks are made by dropping one step onto another or with Add block, and dissolve
when a step taken out of them leaves one. The workout page (`#/w/<id>`) is the one editor, as on
the phone: a block's header opens its sheet; the first edit of a workout not yours saves one copy
of it, "(mine)" (`copyOnEdit`), which Search never lists and Saved shows in place of the original. `src/features/runsheet/model.ts` holds every edit as a pure function; `fromLegacy()` converts
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

`imports/exercise-details.json` gives all 399 catalogue exercises a movement pattern, equipment,
muscles, difficulty, cues, mistakes, easier/harder swaps and default sets, reps and rest;
`imports/catalogue/new-exercises.json` adds 50 staples (they show in the web picker; iOS after
`npm run export:ios`). No app reads the details yet. Validate with `node tools/validate-exercises.mjs`.

## Status

Live since 6 Sep 2026. Timer (rounds, for time, AMRAP, EMOM, ladders, resume after reload; big
button Pause on a countdown, "Set 2 of 4 done" on a set; Finish and Discard in a ⋯ top right;
on iOS a straight-set block's table keeps the current set centred and fades at an edge with more
rows behind it, and on a treadmill has an INCL column with −/+ by 0.5 % on the set being set;
parked before a block, its card has a − / + for every dial, speed or load and a treadmill's
incline, each with last time's setting; the Session sheet's set grid of a treadmill step has an
Incline − / + above its sets),
Supabase sign-in (email code and Google) and three-way sync (sessions, own workouts, favourites,
prefs, custom exercises; v0.9 rows preserved), editor with drag-to-group and text commands, 472
imported workouts, scores and progression, follow-along videos, Discover with recommendations
(For you lists at most six: workouts by a creator done at least twice, ones sharing two exercises
with your history, saved-not-done, and the next day of a program in progress; a creator done twice
outranks any exercise overlap; For you sends the user to Search when history yields no picks),
settings, share links, quick log, post-workout stats with a body map, a finish screen that leads with the workout count, streak, records set and deltas vs last time plus a share card (PNG), a 1–10 session effort on every result (written to Apple Health as the workout effort score on iOS 18+), offline via a service worker.
The web timer announces each step to a screen reader through one hidden polite live region ("Rest,
30 seconds", "Barbell bench press, set 2 of 3", "Paused", "Workout finished"): it speaks on a slot
or phase change, never on a tick. The landing page's looping hero demo renders the same screen with
`announce={false}`, so it stays silent.
Each session records where it was started (`startedFrom`: a Discover tab, the Up next card on home, the Me tab, Repeat, a
share link) so the share started from a home recommendation can be measured. The iOS app writes the
same field from its Workouts tab (Pick up again → history, Mine → mine, a catalogue section or a
search result → search, Saved → saved) and from a `tigerworkouts://w/` link (link). The origin
rides in the crash-safe copy on both, so a resumed or recovered session keeps it.
Sign out pushes first, then empties the device for the next account (sessions, workouts, favourites,
saved, exercises, training maxes and the `tiger:synced` snapshot); while the push fails or a session
is still unsaved to the account it refuses with a message instead, so no unsynced session is lost.
Coaching (`#/coach`, `#/coaches`, migration 0008): a PT invites clients by link, sends them workouts
with a note, sees their sessions against what was prescribed and trades notes; the comparison with
Hevy Coach and the next three items are in `specs/pt-publishing.md` (draft).

Not yet: imperial units in the UI (stored only), Fitbit heart rate is read on the session page but
not charted, Storybook stories for every screen state.

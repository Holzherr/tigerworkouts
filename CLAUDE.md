# TigerWorkouts

**`Holzherr/tigerworkouts`**, public — the repo and the site both. Nothing sensitive goes in here.
Every push to `main` deploys to https://tigerworkouts.com; pull requests build and test without
deploying. See README.md for what is where.

## Before calling a change done

- **Web:** `npm run build`, not only `npm run check-types`. The build runs `tsc -b`, which is
  stricter — a deploy has failed on an error `check-types` let through. Then `npm test`.
- **iOS:** run it on the simulator, not only a type-check. The first build type-checked clean and
  still would not install, launched with an empty list, and flooded the Lock Screen with updates.
  `cd ios && xcodebuild -project TigerWorkouts.xcodeproj -scheme TigerWorkouts
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test` runs the unit tests and the UI
  walkthroughs, which attach a screenshot per screen (`xcrun xcresulttool export attachments`).
- **After a deploy:** curl the live bundle for a string the change added. A green workflow is not
  the same as the new code being served.

## Rules that are easy to break

- **Never rename a storage key** (`workout-hub:*`, `workout-hub-next:*` in localStorage, table
  names in Supabase). The names are old; renaming them wipes people's data. See REBRAND.md.
- **The service worker must not strand a phone**, and Cloudflare must never cache `/sw.js`. A
  stale worker once stranded a phone on a broken build with no way out. What holds today:
  the start URL (`/`, `index.html`) is served from the precache, so the home-screen app opens at
  once and picks up a deploy one launch later (Nick, 2026-11-15); every other navigation is
  network-first (4 s, then the `shell` cache); the worker is registered under a per-build URL
  (`sw.js?v=<build>`, `src/app/update-prompt.tsx`); and `index.html` heals itself once (clears
  workers and caches, reloads with `?r=`, which the precache does not answer) when the bundle
  does not start. Keep all four.
- **First load stays small** (review D12, 2026-11-15). `npm run build` ends with
  `tools/check-bundle.mjs`, which fails when the JS needed before first paint passes its budget, or
  when the catalogue or the editor's drag and drop are back in it. The catalogue loads after first
  paint (`src/features/workouts/catalogue.ts`: `IMPORTED` and `FULL_LIBRARY` fill in place, call
  `useCatalogue()` to draw again); screens the first paint does not need come from
  `src/app/lazy.tsx`. Mine, the timer, the result sheet and History stay in the first file, so a
  saved workout starts with no network.
- **One catalogue.** `imports/` is the source; `legacy/imported.js`, `src/features/exercises/
  library.ts` and `ios/TigerWorkouts/Resources/*.json` are generated from it (or from
  `legacy/data.js`) by the scripts in `tools/`. Edit the source and re-run, never the output.
- **The iOS engine is a port.** `ios/TigerWorkouts/Engine/Runner.swift` follows
  `src/features/timer/runner.ts`; change one, change the other, and port the test.
- **Legacy logs go to `nick-prototypes` issues on purpose** (`GH_REPO` in `legacy/index.html`):
  that is where the workout-log pipeline picks them up. Crash reports from the React app come here.

## Working

Branch per change (`feat/…`, `fix/…`, `chore/…`), in a worktree beside the clone
(`../tigerworkouts-<task>`), PR, then merge — Nick merges; an agent's merge is usually blocked.

## Specs, goals and learnings

Product context lives in `specs/`. Read `README.md` there first, then the spec your task cites. `GOALS.md` is Nick's and stays untouched. `DECISIONS.md` and `LEARNINGS.md` are append-only: add a dated line when you decide or learn something, never rewrite. One spec per feature, first line `Status: draft | agreed | building | built`. Backlog and nightly agent runs: https://github.com/Holzherr/agent-team.

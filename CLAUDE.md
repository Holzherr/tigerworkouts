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
- **The service worker stays network-first for navigations**, and Cloudflare must never cache
  `/sw.js`. A stale worker once stranded a phone on a broken build with no way out.
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

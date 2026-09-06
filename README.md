# TigerWorkouts

The live app at **https://tigerworkouts.com** — creator workouts with a guided timer.

Static site, no build: GitHub Pages (branch `main`, root) behind a Cloudflare proxy, same pattern
as by9am.com. Custom domain = the `CNAME` file. The app code is the v0.9.x single-file build from
[nick-prototypes/workout-hub](https://github.com/Holzherr/nick-prototypes/tree/main/workout-hub);
the React rebuild lives in `nick-prototypes/workout-hub-next` and moves here at parity.

- Backend: Supabase project `icpdzjohsvlpyaluxgbt` (config in `config.js`, anon key only).
- Brand: tiger mark, coral `#ff4d2e`, striped app icon — see `nick-prototypes/workout-hub-next/REBRAND.md`.
- Workout logs still file as issues on nick-prototypes (`GH_REPO` in index.html).

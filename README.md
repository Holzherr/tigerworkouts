# TigerWorkouts

The live app at **https://tigerworkouts.com**.

Built by `.github/workflows/deploy.yml` from
[nick-prototypes/workout-hub-next](https://github.com/Holzherr/nick-prototypes/tree/main/workout-hub-next)
(React, Vite base `/`) and deployed to GitHub Pages behind a Cloudflare proxy. Custom domain = the
`CNAME` file.

- `/` — the React app (PWA)
- `/legacy/` — the v0.9 single-file app, kept for a while after the cutover
- `/storybook/` — the component library

Deploy: push to `main` here, or run the workflow by hand (`gh workflow run deploy.yml -R Holzherr/tigerworkouts`)
after merging to nick-prototypes.

- Backend: Supabase project `icpdzjohsvlpyaluxgbt` (anon key in the app config).
- Brand: tiger mark, coral `#ff4d2e`, see `nick-prototypes/workout-hub-next/DESIGN.md`.

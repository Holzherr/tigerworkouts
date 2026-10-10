Status: draft

# Public exercise library: a page per exercise, a download, a sitemap

Nick, board, 2026-09-27: publish an exercise ontology (exercises, muscles, equipment, movement
patterns, progressions/regressions, cues) online so others can index and use it, as open pages
plus downloadable data with good SEO. Nick, board, 2026-10-04: "Yes — make the exercise library
public: one page per exercise, a JSON download, a sitemap, app link on each." Goal G-13; its
constraint holds: the app link stays on every public page.

## Fixed by Nick (2026-10-04)

1. **One page per exercise**, static HTML, readable without JavaScript.
2. **One JSON download** of the whole library.
3. **A sitemap** listing every page.
4. **The app link on every page.**

## What is there now

- `main`: exercises come from `src/features/exercises/library.ts` (72) and the per-source
  `imports/*/new-exercises.json` (277): key, name, unit, group, one cue. No muscles or links.
- Branch `data/exercise-catalogue` (3af071f, unmerged): `imports/exercise-details.json`, 399
  entries (pattern, equipment, primary/secondary muscles, difficulty, 3–5 cues, 1–3 mistakes, ≤3
  regressions and progressions, default sets/reps/rest, perSide, `sameAs` on duplicates);
  `imports/catalogue/new-exercises.json` (50 new staples); `tools/validate-exercises.mjs`.
- The site is one hash-routed app: every URL a crawler sees is `/`. `#/x/<key>` is the user's own
  logbook, empty for a visitor. No `robots.txt`, no sitemap. 72 exercises have a still in
  `public/media/<key>.jpg`. The deploy copies `dist/` to the site root.

## (a) Sidecar file; the iOS export ignores the new fields

Merge the branch as it is: `imports/exercise-details.json` stays a sidecar keyed by exercise key.
Merging the fields into the exercise files would touch nine sources and the `library.ts`
generator; the sidecar already validates against all of them, and `validate-imports.mjs`,
`export-ios.mjs` and `imported.ts` read only `imports/*/` folders, so they do not see it.
`imports/catalogue/new-exercises.json` is read like any source's file, so the 50 new exercises
reach the web editor and, after `npm run export:ios`, the phone. The iOS export does **not** copy
the new fields: nothing on the phone shows them (see (e)). `node tools/validate-exercises.mjs`
joins the deploy workflow's test step, so details that drift from the catalogue fail the PR.

## (b) URLs and what a page shows

`https://tigerworkouts.com/exercises/<slug>/`, slug = the name in lower case, non-letters to
hyphens (`Barbell back squat` → `/exercises/barbell-back-squat/`); index at `/exercises/`. Names
read well in a search result; keys (`bb_`, `db_`) stay internal. Two exercises with one slug fail
the build, naming both. An entry with `sameAs` gets no page; links to it go to the `sameAs` page.

Each page, top to bottom:

1. Header: mark and "Open TigerWorkouts", linking to `/` — **the app link**, on every page.
2. `h1` name; under it difficulty · pattern · equipment ("Medium · Squat · Barbell, plates, rack").
3. The still from `public/media/<key>.jpg` when there is one; no placeholder otherwise.
4. Muscles in words: primary, then secondary ("Quads, glutes · also adductors, hamstrings").
5. How to do it: the cues, numbered. Common mistakes: a list. Easier / Harder: links to the pages.
6. A starting prescription from `defaults`: "4 sets of 5–8 reps, 2:30 rest", "each side" if perSide.
7. Workouts with it: up to 8 catalogue workouts using it, most-used first, each linking
   `https://tigerworkouts.com/#/w/<id>` (runs without an account). Left out when none use it.
8. Footer: "Exercise data CC BY 4.0 — download all (JSON)", linking `/exercises.json`.

Head: `<title>` "<Name>: how to do it, muscles, easier and harder versions · TigerWorkouts"; meta
description = first cue plus primary muscles (≤160 characters); canonical link; Open Graph title,
description, image (the still, else the app icon). No JSON-LD: no schema.org type a search engine
renders for an exercise. One inline stylesheet in DESIGN.md's colours and type, light and dark by
`prefers-color-scheme`, readable at 390 px. No JavaScript. The index lists every exercise grouped
by pattern, with the same header and footer.

## (c) Indexable on a hash-routed app: HTML written at build time

`tools/build-exercise-pages.mjs` runs as the last step of `npm run build` (`tsc -b && vite build
&& node tools/build-exercise-pages.mjs`). It reads the catalogue as `export-ios.mjs` does (esbuild
on `library.ts`, the `new-exercises.json` files, the workouts) plus `exercise-details.json`, and
writes `dist/exercises/<slug>/index.html`, `dist/exercises/index.html`, `dist/exercises.json`,
`dist/sitemap.xml` and `dist/robots.txt`.

- `deploy.yml` needs no new step: it already copies `dist/`, and a PR build runs the script too.
- Written after `vite build`, the pages are not in the service worker's precache, so app users
  download nothing extra. The network-first rule for navigations covers them unchanged.
- GitHub Pages serves `exercises/<slug>/index.html` at `/exercises/<slug>/`; Cloudflare does not
  cache HTML by default. No new dependency: string templates with an escape function.

## (d) The download: exercises only, CC BY 4.0

`https://tigerworkouts.com/exercises.json`, one object: `name`, `url` (the index), `license:
"CC-BY-4.0"`, `attribution` ("TigerWorkouts, https://tigerworkouts.com/exercises/"), `generated`
(date), `vocabularies` (pattern, equipment and muscle lists exported by `validate-exercises.mjs`),
and `exercises`: per exercise `key`, `name`, `unit`, `url` and every field of the details file.

No workouts. They are third-party programmes (CrossFit, NHS, YouTube creators) in our words with a
source link each; their licences are not ours to grant. The exercise data is ours, and CC BY lets
others index and build on it while the attribution links back. The licence is one string to change.

## (e) The timer's exercise sheet: unchanged

The timer and the exercise sheet show nothing new, on web or iOS; they keep the one cue. Between
sets the user has one glance, and five cues plus mistakes do not fit it. 0 of 6 sessions in 8 days
ran a catalogue workout, so nothing shows anyone missing them. Swaps in the sheet are a later item.

## (f) Build items, in order; each touches only the files it lists

### 1 · S — Merge the exercise details into `imports/`

Files: from `data/exercise-catalogue` (3af071f) `imports/exercise-details.json`,
`imports/catalogue/new-exercises.json`, `tools/validate-exercises.mjs`, `imports/SCHEMA.md`; one
line in `.github/workflows/deploy.yml`'s test step; `ios/TigerWorkouts/Resources/exercises.json`
(regenerated); `README.md`.

- `node tools/validate-exercises.mjs` → exit 0, "399 exercises with details", "all valid".
- `node tools/validate-imports.mjs` → exit 0; `npm run build`, `npm test` exit 0; iOS tests pass.
- `npm run export:ios`: `git diff --stat ios/` lists only `exercises.json`, and
  `grep -o '"key"' ios/TigerWorkouts/Resources/exercises.json | wc -l` goes from 349 to 399 (the
  file is one minified line, so `grep -c` stays at 1).
- `deploy.yml`'s test step runs `node tools/validate-exercises.mjs`.

### 2 · M — Exercise pages and index at build time

Files: `tools/build-exercise-pages.mjs` (new), `package.json` (`build` script),
`src/features/exercises/pages.test.ts` (new: runs the script into a temp dir and reads the output
through `node:fs`, as `sync.test.ts` does), `README.md`.

- `npm run build` → 0; `find dist/exercises -name index.html | wc -l` = entries without `sameAs` + 1.
- `dist/exercises/barbell-back-squat/index.html` has the name in `<title>` and `<h1>`, every cue, a
  link to each regression and progression page, `rel="canonical"`. The test checks that every page
  has the header link to `/`.
- A used exercise's page links `https://tigerworkouts.com/#/w/<id>`; an unused one has no list.
- Two names giving one slug fail the script naming both keys; a name with `<` and `&` is escaped;
  no page has a `<script>` (fixtures in the test).
- `dist/sw.js` does not mention `exercises/`.
- Screenshots of `/exercises/barbell-back-squat/` and `/exercises/` at 390×844 and 1280×800 in the PR.

### 3 · S — Download, sitemap, robots, a link from the app

Files: `tools/build-exercise-pages.mjs`, `src/features/exercises/pages.test.ts`,
`src/features/landing/components/landing-screen.tsx` (one "Exercise library" link to
`/exercises/`), its story, `README.md`.

- `dist/exercises.json` parses, has `license: "CC-BY-4.0"`, one entry per exercise without
  `sameAs`, each with `url` and every details field, and no workout.
- `dist/sitemap.xml` is valid sitemap XML with absolute URLs for `/`, `/exercises/` and every page;
  `dist/robots.txt` allows all and names the sitemap.
- The landing screen story shows the "Exercise library" link.
- After the deploy, on tigerworkouts.com: `/exercises/barbell-back-squat/` contains "Barbell back
  squat", `/sitemap.xml` has pages + 2 `<loc>`, `/exercises.json` answers 200.

## How we know it worked; what is out

Served: item 3's curl checks. Indexed: Search Console's page count for `/exercises/`, no data until
Nick adds the property. G-13's `pt_client_runs` does not move from this directly. Out: pages for
workouts or creators, stills for the 327 without one, details in the app, translations, an API.

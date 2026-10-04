Status: draft

# Public exercise library: a page per exercise, a download, a sitemap

Nick, board, 2026-09-27: "build out a public content library for TigerWorkouts — an exercise
ontology (exercises, muscles, equipment, movement patterns, progressions/regressions, cues) — and
publish it online so others can index and use it (open pages + downloadable data, good SEO)."
Nick, board, 2026-10-04: "Yes — make the exercise library public: one page per exercise, a JSON
download, a sitemap, app link on each. Let a Builder draft the spec."

Goal G-13 (PT and creator publishing). Its constraint applies here: the app link stays on every
public page.

## Fixed by Nick (2026-10-04)

1. **One page per exercise**, static HTML, readable without JavaScript.
2. **One JSON download** of the whole library.
3. **A sitemap** listing every page.
4. **The app link on every page.**

## What is there now

- `imports/` on `main`: 472 workouts; exercises come from `src/features/exercises/library.ts` (72,
  generated from `legacy/data.js`) plus the per-source `imports/*/new-exercises.json` (277). Each
  has a key, name, unit, group and one cue. Nothing else: no muscles, pattern, equipment or links.
- Branch `data/exercise-catalogue` (one commit, 3af071f, not merged): `imports/exercise-details.json`
  with 399 entries (pattern, equipment, primary and secondary muscles, difficulty, 3–5 cues, 1–3
  mistakes, up to 3 regressions and 3 progressions, default sets/reps/rest, perSide, sameAs on
  duplicates); `imports/catalogue/new-exercises.json`, 50 new staples; `tools/validate-exercises.mjs`
  (schema, coverage of every catalogue key, every link resolves); a section in `imports/SCHEMA.md`.
- The site is one hash-routed React app on GitHub Pages behind Cloudflare. Every URL a search
  engine sees is `/`; `#/x/<key>` exists but is the user's own logbook for an exercise, empty for a
  visitor. No `robots.txt`, no sitemap.
- `public/media/<key>.jpg` exists for 72 exercises (78 files, 6 of them `.mp4`).
- The deploy copies `dist/` to the site root (`.github/workflows/deploy.yml`, "Assemble site").
- The service worker precaches `**/*.{js,css,html,…}` found in `dist/` when `vite build` runs.

## (a) Sidecar file; the iOS export ignores the new fields

**Recommendation:** merge the branch as it is. `imports/exercise-details.json` stays a sidecar at
the top of `imports/`, keyed by exercise key, beside the exercise files rather than merged into
them.

- Why: the exercise files are split across nine sources and `library.ts` is generated from
  `legacy/data.js`; merging the fields would touch every one of them and the generator. The
  sidecar already validates against all of them, and `validate-imports.mjs`, `export-ios.mjs` and
  `src/features/workouts/imported.ts` only read `imports/*/` folders, so they do not see it.
- `imports/catalogue/new-exercises.json` is read like any other source's file: the web app's glob
  in `imported.ts` and `export-ios.mjs` both pick it up, so the 50 new exercises reach both apps
  (pickable in the editor, in `exercises.json` after `npm run export:ios`).
- The iOS export does **not** copy the new fields. Nothing on the phone shows them (see (e)), and
  the bundle stays as it is. When a screen needs them, the export adds them then.
- `node tools/validate-exercises.mjs` joins the deploy workflow's test step, so a details file
  that drifts from the catalogue fails the PR.

## (b) URLs and what a page shows

**URL:** `https://tigerworkouts.com/exercises/<slug>/`, slug = the exercise name in lower case,
non-letters to hyphens (`Barbell back squat` → `/exercises/barbell-back-squat/`). The index is
`/exercises/`. Keys stay out of URLs: they are internal (`bb_`, `db_`) and never renamed, names
read well in a search result.

- Two exercises with the same slug fail the build, naming both.
- An entry with `sameAs` gets no page of its own; its key's links point at the `sameAs` page.

**Each page, top to bottom:**

1. Header: the TigerWorkouts mark and name, linking to `/` — **the app link**, on every page,
   labelled "Open TigerWorkouts".
2. `h1` the exercise name; one line under it: difficulty · pattern · equipment
   ("Medium · Squat · Barbell, plates, rack").
3. The still from `public/media/<key>.jpg` when one exists; no placeholder when not.
4. **Muscles:** primary, then secondary, in words ("Quads, glutes · also adductors, hamstrings").
5. **How to do it:** the cues, numbered, in order.
6. **Common mistakes:** the mistakes as a list.
7. **Easier / Harder:** regressions and progressions, each a link to its page.
8. **A starting prescription:** from `defaults` — "4 sets of 5–8 reps, 2:30 rest", "each side"
   when `perSide`.
9. **Workouts with it:** up to 8 catalogue workouts that use the exercise, most-used first, each
   linking to `https://tigerworkouts.com/#/w/<id>` (opens the workout in the app, runnable without
   an account). The section is left out when no workout uses it.
10. Footer: "Exercise data CC BY 4.0 — download all (JSON)", linking `/exercises.json`.

**Head:** `<title>` "<Name> — how to do it, muscles, easier and harder versions · TigerWorkouts";
meta description = the first cue plus the primary muscles (≤ 160 characters); `<link
rel="canonical">`; Open Graph title, description and image (the still when there is one, else
the app icon); `lang="en"`. No JSON-LD: no schema.org type a search engine renders for an
exercise.

**Look:** one inline stylesheet using DESIGN.md's colours and type, light and dark by
`prefers-color-scheme`, readable at 390 px. No JavaScript, no React, no service worker
registration.

**Index `/exercises/`:** every exercise grouped by pattern, name and difficulty per row, each
linking to its page; the same header and footer.

## (c) Indexable on a hash-routed app: HTML written at build time

**Recommendation:** a Node script, `tools/build-exercise-pages.mjs`, run as the last step of
`npm run build` (`tsc -b && vite build && node tools/build-exercise-pages.mjs`). It reads the
catalogue the way `export-ios.mjs` does (esbuild on `library.ts`, the `new-exercises.json` files,
the workouts for "Workouts with it") plus `exercise-details.json`, and writes into `dist/`:
`exercises/<slug>/index.html`, `exercises/index.html`, `exercises.json`, `sitemap.xml`,
`robots.txt`.

- The deploy already copies `dist/` to the site root, so `deploy.yml` needs no new step, and a PR
  build runs the script too.
- The pages are written after `vite build`, so the service worker does not precache them: an app
  user downloads nothing extra. The worker's network-first rule for navigations covers
  `/exercises/…` like any other page; nothing about it changes.
- GitHub Pages serves `exercises/<slug>/index.html` at `/exercises/<slug>/`. Cloudflare does not
  cache HTML by default; no rule changes.
- No new dependency: string templates with an escape function.

## (d) The download: exercises only, CC BY 4.0

**Recommendation:** `https://tigerworkouts.com/exercises.json`, one file:

```jsonc
{
  "name": "TigerWorkouts exercise library",
  "url": "https://tigerworkouts.com/exercises/",
  "license": "CC-BY-4.0",
  "attribution": "TigerWorkouts, https://tigerworkouts.com/exercises/",
  "generated": "2026-10-…",
  "vocabularies": { "pattern": [...], "equipment": [...], "muscles": [...] },
  "exercises": [
    { "key": "bb_back_squat", "name": "Barbell back squat", "url": "https://tigerworkouts.com/exercises/barbell-back-squat/",
      "unit": "kg", ...every field of exercise-details.json }
  ]
}
```

- Exercises only, **no workouts**. The workouts in `imports/` are third-party programmes (CrossFit,
  NHS, YouTube creators) described in our own words with a source link each; their licences are
  theirs, so we do not re-license them. The exercise data is ours: names, cues, mistakes, links.
- CC BY 4.0: others may index, copy and build on it; the attribution brings links back. Nick's
  call to change; the licence string is one line.
- Vocabularies come from `tools/validate-exercises.mjs`'s exported lists, so the file explains its
  own codes.

## (e) The timer's exercise sheet: unchanged

**Recommendation:** the timer and the exercise sheet show nothing new from this work, on web or
iOS. They keep the one cue. Mid-workout the user has one glance between sets; five cues and a
mistakes list do not fit it, and 0 of 6 sessions in 8 days ran a catalogue workout, so there is no
evidence anyone is missing them. A later item can add "Easier / Harder" swaps to the sheet if a PT
asks; it is out of this spec.

## (f) Build items

Three items, in order. Each lists its files; nothing else changes.

### 1 · S — Merge the exercise details into `imports/`

Files: `imports/exercise-details.json`, `imports/catalogue/new-exercises.json`,
`tools/validate-exercises.mjs`, `imports/SCHEMA.md` (all from `data/exercise-catalogue`, 3af071f),
`.github/workflows/deploy.yml` (one line in the test step), `ios/TigerWorkouts/Resources/exercises.json`
(regenerated), `README.md`.

Acceptance:
- `node tools/validate-exercises.mjs` → exit 0, "399 exercises with details", "all valid".
- `node tools/validate-imports.mjs` → exit 0.
- `npm run export:ios` then `git diff --stat ios/` shows only `exercises.json`, 50 keys more
  (`grep -c '"key"' ios/TigerWorkouts/Resources/exercises.json` before and after).
- `deploy.yml`'s test step runs `node tools/validate-exercises.mjs`.
- `npm run build` and `npm test` exit 0; the iOS unit tests pass on the simulator.

### 2 · M — Exercise pages and index at build time

Files: `tools/build-exercise-pages.mjs` (new), `package.json` (the `build` script),
`src/features/exercises/pages.test.ts` (new; runs the script into a temp dir and reads the
output, as `sync.test.ts` reads a file through `node:fs`), `README.md`.

Acceptance:
- `npm run build` → exit 0, and `find dist/exercises -name index.html | wc -l` = the number of
  entries without `sameAs`, plus 1 for the index.
- `dist/exercises/barbell-back-squat/index.html` contains the name in `<title>` and `<h1>`, every
  cue, a link to each regression and progression page, `rel="canonical"`, and `href="/"` in the
  header (the app link). Every page has the app link: the test checks all of them.
- A page for an exercise that some workout uses links `https://tigerworkouts.com/#/w/<id>`; one
  that no workout uses has no "Workouts with it" section.
- Two names giving one slug fail the script with both keys named (test with a fixture).
- No `<script>` in any page; text from the data is HTML-escaped (test with a name containing `<`
  and `&`).
- `dist/sw.js` does not list `exercises/` (precache unchanged).
- Screenshots of `/exercises/barbell-back-squat/` and `/exercises/` at 390×844 and 1280×800, light
  and dark, in the PR.

### 3 · S — Download, sitemap, robots, and a link from the app

Files: `tools/build-exercise-pages.mjs`, `src/features/exercises/pages.test.ts`,
`src/features/landing/components/landing-screen.tsx` (one link, "Exercise library", to
`/exercises/`), its story, `README.md`.

Acceptance:
- `dist/exercises.json` parses, has `license: "CC-BY-4.0"`, one entry per exercise without
  `sameAs`, each with `url` and every details field; no workout in it.
- `dist/sitemap.xml` is valid sitemap XML listing `/`, `/exercises/` and every exercise page, with
  absolute `https://tigerworkouts.com` URLs; `dist/robots.txt` allows all and names the sitemap.
- The landing screen story shows the "Exercise library" link.
- After the deploy: `curl -s https://tigerworkouts.com/exercises/barbell-back-squat/ | grep -c
  "Barbell back squat"` ≥ 1, `curl -s https://tigerworkouts.com/sitemap.xml | grep -c "<loc>"` =
  pages + 2, `curl -sI https://tigerworkouts.com/exercises.json` → 200.

## How we know it worked

- Pages served: the curl checks in item 3.
- Indexed: Google Search Console's indexed-page count for `/exercises/`. Not set up: no data until
  Nick adds the property and submits the sitemap (a Nick step, outside the repo).
- G-13's metric (`pt_client_runs`) does not move from this directly; the library gives a PT pages
  to send and gives search a way in.

## Not in this spec

- Pages for workouts or creators (creator pages stay hash routes).
- Images for the 327 exercises without a still.
- Showing details in the app (the timer, the editor, the logbook).
- Translations, structured data beyond the head tags, an API.

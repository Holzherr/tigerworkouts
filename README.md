# workout-hub — v0.3

Phone-shaped "Sweat / F45"-style workout app: creators publish workouts, you
discover one, do it with a guided interval timer, and log what you actually did.
No accounts, no backend. Everything lives in the phone's localStorage; workouts
travel between phones as share links.

Live: https://holzherr.github.io/nick-prototypes/workout-hub/

## What's in v0.3 — PWA + cloud

- **Installable PWA**: `manifest.webmanifest`, icons, `sw.js` (network-first
  app shell with offline fallback, cache-first for CDN + thumbnails). Add to
  home screen on iPhone → runs full-screen, works with no signal in the gym.
  Bump `CACHE` in `sw.js` when shipping.
- **Supabase backend** (`supabase/`): schema in `migrations/0001_init.sql` —
  profiles, exercises, workouts, sessions, user_state (favourites, prefs),
  device_metrics (Fitbit rows) — all behind row-level security; public
  workouts/exercises readable by anyone, everything else owner-only.
  `seed.sql` is generated from `data.js` by `node tools/seed.mjs`.
- **cloud.js**: magic-link sign-in (PKCE), debounced push of local state on
  every save, pull of own rows + public content on open. localStorage stays
  the cache, so nothing changes when offline. `config.js` holds the project
  URL + anon key; empty = cloud off.
- **Profile**: sign-in card, sync status, sign out, metric/imperial toggle
  (stored; display conversion is spec item 4).
- **Fitbit in history**: `tools/health-sync/push-supabase.py` (assistant repo)
  upserts Google Health workouts/sleep/day rows into `device_metrics`; a
  session's summary shows avg HR / calories / zone minutes from the
  overlapping Fitbit workout (±30 min via `session_device()`).
- Share link for cloud-backed workouts is the short `#/w/<id>` form; opening
  it pulls the workout from the cloud.

Setup once: `npx supabase login` → `npx supabase projects create workout-hub`
→ `npx supabase link` → `npx supabase db push` → `psql < supabase/seed.sql`
(or `npx supabase db query`) → paste URL + anon key into `config.js` → set
Auth → URL configuration → Site URL / redirect URLs to the Pages URL.

## What's in v0.2 (after the first gym test)

- **Discover** — greeting + Create button, tag filter chips, a featured hero
  card, creators row, compact workout cards with an icon tile per workout.
- **Builder** (Create, or Edit / Duplicate & edit on any workout) — title,
  creator, level, tags; interval blocks (rounds, work, rest, exercises with
  targets) and steady blocks (incline, repeat, timed segments at a speed).
  "New exercise…" in any dropdown adds a custom exercise with icon, unit,
  YouTube link and optional image.
- **Share link** — encodes the workout (plus any custom exercises it uses)
  into the URL. Opening it adds the workout to that phone's Discover. This is
  how Priyanka's workouts get to Nick without a backend.
- **Exercise library** (creator tool, reached from the builder, not a user
  tab) — every exercise (built-in + custom), icon, unit, demo, how many
  workouts use it.
- **Do mode, reworked from feedback**
  - Block strip at the top: done / current (bright) / upcoming.
  - Step strip per round with rest shown as its own step; current step
    highlighted, next step dashed. Each exercise has an icon + colour
    (kettlebell amber, dumbbell violet, treadmill sky, walk green).
  - Total elapsed clock in the header.
  - "After this: …" on every block's ready screen; "Next block: …" during
    the last round.
  - Per-round tracking: changing the weight mid-block records it for that
    round, so the log reads `17.5 kg ×6, 15 kg ×2`. Skipping rest early
    records the real rest, so the log says `rest ~15s of 30s`.
  - Swipe a step left to drop it (with Undo). Skip block button.
  - Incline stepper on treadmill exercises (sprints) and the walk block.
- **Log** — `dropped`, `skipped`, rest variance, incline all in the text.
- **v0.2.1** — Quick log row on Discover: favourite activities (seeded with
  "Game of padel") logged in one tap with duration, intensity and a note;
  add/edit favourites; activities show in history and copy out like any
  session. Swipe-to-drop no longer shows the Drop label until you swipe.

## Data model

`data.js` holds `EXERCISES` (shared library: name, YouTube id, unit, step,
icon, color, cue, optional image, `incline: true`) and `WORKOUTS`
(creator, blocks). Block types:

- `interval` — `rounds × (each exercise: work_s on, rest_s off)`
- `steady` — `segments × repeat`, each segment timed at a speed, one incline

User-created workouts and custom exercises live in localStorage under
`workout-hub:v1` (`workouts[]`, `exercises{}`), merged with the seed at
runtime. Sessions (`sessions[]`) record per block: rounds done, per-round
actuals per exercise, real rest durations, dropped steps, incline.

## Getting a log out

Copy log → paste into email or to Echo, who files it into the health store.
Save to GitHub → issue titled `[workout-log] <date> — <title>` with the text
and a JSON block, for a later sync script to pick up.

## Spec — where this goes next

Captured from Nick, 2 Sep 2026. Not built yet; ordered roughly by value.

### 1. Workout + exercise database
Move `EXERCISES` / `WORKOUTS` out of a JS file into a real store so content
can be referenced, versioned and shared: one row per exercise (name, aliases,
muscle groups, equipment, unit, media[]), one per workout (creator, blocks,
media, source), one per session. Media = still image (illustration or photo,
like the manufacturer-style exercise diagrams Nick linked) + demo video.
First home: a JSON/SQLite store on the VM behind the dashboard server, same
pattern as the health store; later a hosted DB with auth.

### 2. Seed content from YouTube and free sources
Import popular free workouts (YouTube follow-alongs, magazine "best 20-minute
kettlebell workout" pieces such as the Tom's Guide / Fit&Well style pages Nick
linked) as structured workouts. Pipeline: URL → transcript/description → LLM
extracts blocks/exercises/targets → human check → published with `source`
and `video`. **Follow-along mode:** when a workout has a video, Do mode shows
the video alongside the timer (video on top, step strip + clock below, timer
synced to the video's timestamps); when it doesn't, today's timer-only mode.

### 3. AI-generated demo media
Generate our own exercise stills and short demo clips instead of linking
YouTube. Voice cues via ElevenLabs (audio only; it doesn't make video).
Video via a text/image-to-video model (Veo, Runway Gen-4, Kling or similar)
driven from a consistent reference character. Default model: a toned female
in the Kayla Itsines mould; later the user picks the body/model they want to
see and every exercise renders in that variant. Needs a fixed camera/framing
spec per exercise so clips are consistent across the library.

### 4. Units and localisation
Profile setting: metric / imperial. Content carries the unit system it was
designed in; display converts (kg↔lb, kph↔mph, km↔mi). Targets round to
sensible plate/dumbbell increments in the display unit (15 kg → 35 lb, not
33.07), and logging stores the value in the unit the user actually used plus
the canonical metric value. Open question: gym equipment availability (a
17.5 kg dumbbell exists, a 38.6 lb one doesn't).

### 5. Profile metrics and estimation
Profile holds weight over time (saved series), height, age, sex, resting HR,
pulled from Apple Health / Google Health where available. Use it for calorie
and load estimates per session (MET-based first, HR-based when a watch
stream exists), and to scale suggested targets.

### 6. AI coaching over time
Track key metrics per exercise and per workout across sessions: top weight,
volume (weight × rounds × work seconds), rest adherence, drop/skip rate,
completion time, HR/calories when present. Architecture: every session is an
immutable event; a nightly job rolls events up into per-user per-exercise
time series (the `actuals[]` and `rests[]` already captured in v0.2 are the
raw input). An LLM agent reads the rollups plus the workout library and
proposes the next session or tweaks (raise swings to 32 kg, shorten sprint
rest to 20s, swap lateral raises for face pulls), written back as a draft
workout the user accepts. The same event log feeds the health store and
Google Health.

### 7. Fitbit / watch data in history
Pull heart rate, calories, active-zone minutes and auto-detected workouts
from the Google Health API (the `tools/health-sync` job in the assistant repo
already reads these) and attach them to sessions by time window (±30 min
merge rule from the central health store spec). A session then shows avg/max
HR and calories; activities logged with Quick log (padel, runs) get their
device metrics the same way. Sleep and resting HR land on the profile.

### 8. What successful workout apps have that we don't
Looked at Sweat (Kayla), F45 Training, Peloton, Nike Training Club, Apple
Fitness+, Centr, Ladder, Strong/Hevy, Fitbod, Strava. Common features:

- **Programs** — multi-week progressions (Sweat's 12-week, Ladder's teams)
  with a calendar and "today's workout". Highest value for us: Priyanka's
  circuits become a weekly plan, not a list.
- **Follow-along video + trainer audio** — Peloton/Fitness+/NTC. Covered by
  spec items 2 and 3.
- **Auto-progression + PRs** — Strong/Hevy/Fitbod track PRs, suggest next
  loads, swap exercises for equipment. Covered by item 6; PR badges are cheap.
- **Streaks, badges, challenges, leaderboards** — F45 Lionheart points,
  Strava segments, Fitness+ rings. Add streaks + a monthly challenge with
  Priyanka first.
- **Social** — Strava feed, Ladder team chat, Sweat community. Start with
  "share a completed session" cards, not a feed.
- **Scheduling + reminders** — book a slot, push notification, calendar sync
  (Nick already has calendar sync on the VM).
- **Music** — Spotify/Apple Music hand-off during Do mode.
- **Watch app** — HR on the wrist, haptic timer. Needs native (item 9).
- **Warm-up / cool-down / stretch** auto-added; **rest-day guidance**.
- **Exercise swaps** — "no kettlebell here" → equivalent move.
- **Body metrics + progress photos** (item 5).

Recommended adds, in order: programs/calendar → streaks + PR badges →
exercise swaps → shareable session cards → music hand-off.

### 9. From prototype to a real app — recommended path
Goal: something Nick and Priyanka use daily, hosting near-zero effort,
Claude able to ship and operate everything from the terminal.

- **Keep the web codebase, ship it three ways.** (1) PWA now: add a manifest,
  service worker and icons so it installs to the home screen and works
  offline. (2) Native via **Capacitor** wrapping the same HTML/JS: gives
  HealthKit / Health Connect, push, haptics, App Store/TestFlight. One
  codebase; no React Native rewrite. (3) Web stays the share-link landing.
- **Backend: Supabase** (Postgres, auth, storage, edge functions, free tier).
  Tables: users, exercises, workouts, sessions, favorites, device_metrics.
  Row-level security so Priyanka's private workouts stay hers; public ones
  feed Discover. Media (stills, generated clips) in Supabase storage.
  Migrations live in the repo; Claude applies them with the Supabase CLI.
- **Hosting: GitHub Pages (or Cloudflare Pages) from the repo on push**, as
  now. No servers to patch. The VM keeps only the Google Health sync job
  (or that moves to a Supabase scheduled edge function).
- **Rollout**
  1. Week 1: PWA + Supabase sync of localStorage (sessions, workouts,
     favourites). Magic-link sign-in. Priyanka builds workouts in-app and
     shares by link. Fitbit HR merge (item 7).
  2. Weeks 2–3: Capacitor iOS build → TestFlight for the two of you
     (internal testing needs no App Store review). HealthKit write of
     sessions, HR read. Push reminder for scheduled workouts.
  3. Weeks 3–5: programs/calendar, streaks + PR badges, seed content import
     (item 2). Android build via the same Capacitor project.
  4. When a stranger should be able to use it: App Store submission,
     privacy policy, account deletion, units (item 4), AI coaching (item 6).
- **Costs**: Supabase free tier, GitHub free, Apple Developer $99/yr,
  Google Play $25 once. Media generation is the only meaningful variable.
- **Ops**: GitHub Actions deploys web + runs Supabase migrations on merge;
  Claude handles releases with `gh`, `supabase`, and Xcode Cloud / fastlane
  for TestFlight uploads.

### Parked from v0.1
- Creator accounts (share links cover the no-backend case for now).
- Direct write to the health store / Google Health (needs a credentialed
  server; the API supports it via `dataPoints.create` on the `exercise` type).
- Watch HR / calories merged into the session.

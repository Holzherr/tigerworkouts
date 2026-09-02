# workout-hub — v0.2

Phone-shaped "Sweat / F45"-style workout app: creators publish workouts, you
discover one, do it with a guided interval timer, and log what you actually did.
No accounts, no backend. Everything lives in the phone's localStorage; workouts
travel between phones as share links.

Live: https://holzherr.github.io/nick-prototypes/workout-hub/

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
- **Library tab** — every exercise (built-in + custom), icon, unit, demo,
  how many workouts use it.
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

### Parked from v0.1
- Creator accounts (share links cover the no-backend case for now).
- Direct write to the health store / Google Health (needs a credentialed
  server; the API supports it via `dataPoints.create` on the `exercise` type).
- Watch HR / calories merged into the session.

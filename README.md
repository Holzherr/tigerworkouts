# workout-hub — v0.1

Phone-shaped "Sweat / F45"-style workout app: creators publish workouts, you
discover one, do it with a guided interval timer, and log what you actually did.
No accounts, no backend. Logs live in the phone's localStorage until you copy
them out.

Live: https://holzherr.github.io/nick-prototypes/workout-hub/

## What's in v0.1

- **Discover** — feed of workouts by creator. Seeded with two of Priyanka's
  gym circuits (kettlebell swings + press, treadmill sprints, incline walk).
- **Workout page** — blocks and exercises, each with a YouTube demo thumbnail
  (tap → inline player + form cue). Shows "last time" values once you've
  logged the workout.
- **Do mode** — full-screen timer that walks every block automatically:
  5s lead-in → work → rest → next exercise / round. Orange = work, blue = rest.
  Beeps at 3-2-1 and on phase change, vibration where supported, screen
  wake-lock. Pause / Skip / End block. Weight or speed steppers pre-filled
  from the target — tap +/− mid-set to record what you actually used.
  Steady blocks (incline walk) run segment by segment with speed + incline.
- **Log only** — skip the timer, get the same log pre-filled with targets,
  adjust, save.
- **Summary** — readable log + JSON. **Copy log** (clipboard), **Share**
  (native share sheet → email etc), **Save to GitHub** (prefilled issue in
  this repo, one tap to submit), Edit, Delete.
- **Profile** — session count, this-week count, minutes, history list,
  Copy all logs.

## Data model

`data.js` holds `EXERCISES` (shared library: name, YouTube id, unit, step,
cue) and `WORKOUTS` (creator, blocks). Block types:

- `interval` — `rounds × (each exercise: work_s on, rest_s off)`
- `steady` — `segments × repeat`, each segment timed at a speed, one incline

Add a workout by appending to `WORKOUTS`. No personal logs are committed here.

## Getting a log out

Copy log → paste into email or to Echo, who files it into the health store.
Save to GitHub → issue titled `[workout-log] <date> — <title>` with the text
and a JSON block, for a later sync script to pick up.

## Parked

- Creator accounts + in-app workout builder (the "wife creates and shares" half).
- Direct write to the health store / Google Health (needs a credentialed server).
- Cardio HR / calories from the watch merged into the session.

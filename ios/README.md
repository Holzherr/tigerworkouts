# TigerWorkouts for iOS

A native SwiftUI app for the gym half of tigerworkouts.com. Same account, same history, same
workouts — the difference is everything the web app cannot reach from Safari.

## Why it exists

iOS Safari has no Vibration API. `navigator.vibrate` is a silent no-op on iPhone, so the PWA's
end-of-workout buzz has never once fired on the phone it was written for. A native app gets
Core Haptics, a background audio slot that keeps a timer running with the screen locked, and the
Keychain. That is the whole case; everything else here follows from being in the same codebase.

What you get that the PWA cannot do:

- **A buzz on every change.** Work, rest, block change and the last three seconds of any countdown
  each have their own haptic shape, so you know what happened without looking. The finish is a long
  roll into three taps.
- **Tones as well.** Generated in memory, no audio files, ducked over your music rather than
  stopping it. Tones are what still reach you once the screen has locked — haptics are a
  foreground-only API on iOS and no app can work around that.
- **The timer survives a locked screen.** `UIBackgroundModes: audio` plus a near-silent keep-alive
  loop, held open only for the length of a session.
- **The session on the Lock Screen.** A Live Activity with the exercise, the countdown and the
  progress bar, plus the Dynamic Island. The clock is sent as the instant it ends rather than as a
  number, so iOS ticks it down itself and the app only pushes on a real transition.
- **Apple Health, both ways.** A finished session becomes an `HKWorkout` typed by what the session
  mostly was, so it counts towards the rings. Coming back the other way: your bodyweight, so the
  calorie figure stops assuming 80 kg, and your heart rate across the session, which turns that
  estimate into a measurement. The heart rate is written to the same `device` field the web app
  already reads.
- **Crash safety.** The run state is written to disk on every transition; reopening within six
  hours picks the session back up where it stopped.

## Layout

```
TigerWorkouts/
  Model/      Runsheet, Library, SessionResult, LastUsed, Editing — Codable mirrors of the TS model
  Engine/     Runner (a port of runner.ts, pure), SessionRunner (tick, haptics, sound, disk)
  Results/    Effort (METs, streak, tonnage), Muscles (name-first matcher)
  Cloud/      Supabase (GoTrue + PostgREST over URLSession), Store, Keychain
  Health/     Health (HKWorkout out; bodyweight and heart rate in)
  Feedback/   Haptics (Core Haptics), Cues (AVAudioEngine), SessionActivityController
  Shared/     SessionActivity — the Lock Screen contract, compiled into both targets
  Features/   Discover, WorkoutDetail, WorkoutEditor, StepEditor, ExercisePicker, Timer,
              ExerciseSheet, History, SessionStats, BodyMap, Me, SignIn
  Resources/  exercises.json, workouts.json — generated, never hand-edited
TigerWorkoutsWidgets/
              SessionLiveActivity — the Lock Screen and Dynamic Island views
```

No third-party dependencies. The Supabase client is four endpoints hand-rolled on URLSession
rather than the SDK, which would otherwise be the only package in the project.

## The catalogue is generated

`Resources/*.json` is the same library the web app builds at compile time, exported by:

```sh
npm run export:ios      # from workout-hub-next/
```

472 workouts and 349 exercises, about 900 KB. Edit `imports/` and re-run — never edit the JSON.
`exercise` is always a key string in the export and every key resolves, which the tests check.

## Building it

The project file is generated from `project.yml`, and committed so it opens without XcodeGen:

```sh
open ios/TigerWorkouts.xcodeproj
```

After changing `project.yml`, re-run `xcodegen generate` in `ios/`.

Two things are yours to do once, because they need credentials or admin rights:

1. **Signing.** `DEVELOPMENT_TEAM` is empty. Set your team on the TigerWorkouts target in Xcode
   (Signing & Capabilities) before running on a device.
2. **Google sign-in.** Add `tigerworkouts://auth` to Supabase → Authentication → URL Configuration →
   Redirect URLs. Until then use the email-code route, which needs no project configuration and is
   the default on the sign-in screen.

## Tests

42 unit tests: the engine ported one for one from `runner.test.ts`, the muscle and effort models,
the last-used carry-over, the editing operations, the Lock Screen state, the whole catalogue
decoding, and the `sessions` row and URL formats the two apps share.

5 UI walkthroughs on the simulator: browse, run and finish; write a workout; settings and the
Health permission sheet; the Lock Screen card following a transition while the phone is locked;
and reopening after the app was killed mid-workout. Each attaches a screenshot per stop:

```sh
xcodebuild -project TigerWorkouts.xcodeproj -scheme TigerWorkouts \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -resultBundlePath out.xcresult test
xcrun xcresulttool export attachments --path out.xcresult --output-path shots
```

The app logs its Live Activity updates and audio session under the subsystem
`com.holzherr.tigerworkouts`, which is how the update flood below was found:

```sh
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.holzherr.tigerworkouts"'
```

## Things the simulator taught

- **The Lock Screen state must hold still for a slot.** The controller pushes when it changes, and
  iOS throttles an app that updates too often. Live progress in it made every 100 ms tick an
  update — 512 in two minutes — and the one that mattered got dropped. It now steps at slot
  boundaries: 7 updates for the same run.
- **An interrupted session is offered, not forced.** Reopen after the app was killed and it asks:
  Resume (paused, so the closed time does not count), Save what I did, or Discard.

## Writing workouts

Tap ＋ on the Workouts tab, or open any catalogue workout and pick "Make a copy I can edit" — a
catalogue workout is never written over, and a copy gets fresh step ids, because a logged session
keys its loads by step id and two workouts must not share them.

Blocks hold steps and run as rounds, for time, AMRAP or EMOM. Steps are measured in seconds, reps,
minutes, metres, calories or max reps, with load, incline and each-side where they apply. Nothing
is sent anywhere until Save; the screen holds one runsheet value and every edit returns a new one.
Workouts go up with `public: true`, the same as the web app writes them, so one written on the
phone shows up there too.

## What is not in it yet

- An Apple Watch app. The phone is the timer; a watch face would be the next real piece of work.
- Follow-along video. The catalogue's YouTube-backed workouts run as timed steps without the clip.
- Editing a past session. History is read-only here; correct a session on the web.

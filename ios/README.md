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
- **Crash safety.** The run state is written to disk on every transition; reopening within six
  hours picks the session back up where it stopped.

## Layout

```
TigerWorkouts/
  Model/      Runsheet, Library, SessionResult, LastUsed — Codable mirrors of the TS model
  Engine/     Runner (a port of runner.ts, pure), SessionRunner (tick, haptics, sound, disk)
  Results/    Effort (METs, streak, tonnage), Muscles (name-first matcher)
  Cloud/      Supabase (GoTrue + PostgREST over URLSession), Store, Keychain
  Feedback/   Haptics (Core Haptics), Cues (AVAudioEngine)
  Features/   Discover, WorkoutDetail, Timer, ExerciseSheet, History, SessionStats, BodyMap, Me, SignIn
  Resources/  exercises.json, workouts.json — generated, never hand-edited
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

29 tests: the engine ported one for one from `runner.test.ts`, the muscle and effort models, the
last-used carry-over, the whole catalogue decoding, and the `sessions` row format both apps share.

Run them from Xcode (⌘U).

> **On this machine, `xcodebuild` cannot currently run.** The Xcode install's
> `IDESimulatorFoundation` plug-in fails to load against a stale
> `/Library/Developer/PrivateFrameworks/DVTDownloads.framework`, and no simulator runtimes are
> installed. The fix needs admin rights:
>
> ```sh
> sudo xcodebuild -runFirstLaunch
> ```
>
> Until that runs, the app was verified by type-checking every source against the iOS 26.5 device
> SDK (clean, no warnings) and by running the whole test suite on macOS through a SwiftPM harness
> over the platform-free sources. The UI has not been run on a device or simulator yet.

## What is not in it yet

- Editing or creating workouts. The app reads the catalogue and your own saved workouts; it writes
  sessions only. Build workouts on the web, run them here.
- A Lock Screen Live Activity. The obvious next native win, and a separate piece of work.
- Apple Health. Sessions go to Supabase only.

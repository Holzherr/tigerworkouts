Status: built

# In-app feedback

Nick, 23 Oct 2026: a hidden way to type feedback inside the app that goes into his agent-team queue automatically,
and for TigerWorkouts "It should capture things like User ID, screen they are on, session etc so it helps the agent
team debug".

## How it works

- **Trigger (hidden):** hold three fingers on the screen for 1.5 s, on any screen, the timer included. On a
  desktop browser, Ctrl/Cmd+Shift+F. Nothing on screen shows it.
- **Sheet:** a text box, Send, and a "What gets sent" disclosure with the exact context. A failed send keeps the
  text and shows the error. Opening it does not touch a running timer.
- **Sent to:** `POST https://feedback.nickholzherr.com/v1/feedback` (Cloudflare Worker `app-feedback`, source in
  Holzherr/agent-team `tools/feedback-worker/`), with the app key and, when signed in, the user's Supabase access
  token in the Authorization header. The Worker asks Supabase who the token belongs to and stores that as
  `verified_user`; the context's `user` is only what the app claims.
- **Into the queue:** the agent-team `feedback` job on the iMac pulls notes every 10 min and files each one as a
  `needs_nick` triage card in `apps/tigerworkouts`. The note is untrusted text: nothing is built until Nick answers.

## Context sent

`user` (id, anonymous, email, provider on web; id, email on iOS), `screen` (web: route name and hash; iOS: tab or
`timer`), `recent_screens` (last 5), `session` (the run in progress or kept on the device: workout id and title,
phase, slot n of m, step, block, mode, round on iOS, elapsed seconds without pauses, sets done, start time),
`app` (platform, web build id or iOS version and build, device, OS, locale, timezone; web adds viewport, online,
standalone), `errors` (web: last 10 console errors and uncaught errors), `client_time`. Never a token.

## Code

Web: `src/features/feedback/` (context.ts, send.ts, recorder.ts, components/feedback-root.tsx and
feedback-sheet.tsx with a story), mounted in `src/main.tsx`. iOS: `ios/TigerWorkouts/Support/InAppFeedback.swift`,
wired in `App/RootView.swift`; debug builds open the sheet on launch with `-TWFeedback`.

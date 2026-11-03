Status: draft

# App Store positioning: for Nick to approve

Nick, 3 Nov 2026: screen 1 says "Use ChatGPT/Claude as your trainer"; the listing says the app is fully functional with or without an AI or human personal trainer. Approve this first; the screenshots and metadata in `ios/fastlane/` are redone after, as a separate item. Nothing here changes the app or the current listing ([app-store-submission.md](app-store-submission.md)).

**The gap, first:** today no new App Store user can reach either assistant. The connector admits only allowlisted accounts, the iPhone app links to neither, and neither directory lists it. Screen 1 ships only after "Before this headline ships" below is done.

## Positioning

TigerWorkouts is for people who train in a gym and want the session run for them. It is a complete workout app on its own: nearly 500 workouts, a hands-free timer, every set logged, progress from your own history. It works with or without a trainer: train alone, let an AI trainer (ChatGPT or Claude) write your sessions from what you actually lifted, or follow a human personal trainer who sends you workouts. Whoever writes the workout, the app runs it and keeps the log.

## Three ways to train

| | Alone | AI trainer (Claude or ChatGPT) | Human PT |
|---|---|---|---|
| What it is | Pick a workout or write one; timer and log | The assistant reads your history through the TigerWorkouts connector and writes workouts into your account; they show in the app from your AI coach | A PT invites you by link; you accept and get their workouts; they see your sessions |
| On main | Catalogue bundled, no account (app-store-submission.md, 5.1.1) | MCP connector #71/#76 (`mcp/`), AI Coach #93/TW-050 (iOS `AICoachSection`, `ios/TigerWorkouts/Features/CoachViews.swift:208`) | PT side #59 (web `#/coach`; iOS invite accept, `CoachViews.swift:122`) |
| Account | None | TigerWorkouts account + assistant account | TigerWorkouts account |

**Reachable today**, read from main on 3 Nov 2026:

| Assistant | Reachable today | Read from |
|---|---|---|
| Claude | Web only: Settings → "Use with Claude" opens `/claude/`, which says add a custom connector with `https://mcp.tigerworkouts.com/mcp` until the directory listing is live. No link in the iPhone app. Directory listing not done. The connector lets in only allowlisted accounts (Nick and the two reviewer accounts); anyone else gets "Not open yet". | `src/features/profile/components/settings-sheet.tsx:181`, `public/claude/index.html:43`, no match for "claude" in `ios/TigerWorkouts/Features/`, `specs/mcp.md:65`, `mcp/wrangler.jsonc:14` |
| ChatGPT | Developer mode only: steps on mcp.tigerworkouts.com (Settings → Apps & Connectors → Developer mode → Create). No link in the web app or the iPhone app. Not in the ChatGPT directory. Same allowlist. | `mcp/src/pages.ts:132`, no match for "chatgpt" in `src/` or `ios/TigerWorkouts/`, `specs/mcp.md:65`, `mcp/wrangler.jsonc:14` |

So the AI path is live only for allowlisted accounts, and a new user would have to find the setup outside the app.

## Before this headline ships

Listed, not filed; the PM files them once Nick approves.

1. Open the connector to everyone: `ALLOWED_USER_IDS` set to `""` and deployed (specs/mcp.md, "Going public"). Who: Nick.
2. Claude directory submission (specs/store-submission.md). Who: Nick.
3. ChatGPT app submission: org verification, domain token, test cases, demo video (specs/mcp.md). Who: Nick.
4. A "Use with ChatGPT or Claude" link in the iPhone app (Me → Settings) to a setup page. Who: builder.
5. ChatGPT setup on tigerworkouts.com beside Claude, and the web Settings link renamed to cover both. Who: builder.
6. Review notes that tell App Review how to try the AI path with the reviewer account. Who: builder.
7. New captures for screens 1 and 6, new headlines in `ios/framed-screenshots.py`, the metadata below. Who: builder, after approval.

Until 1 and 3 are done, screen 1 and the promotional text drop "ChatGPT" (Claude only); until 1 and 2 are done, neither ships.

## Screenshots

Current headlines from `ios/framed-screenshots.py`. Screen 1 is a new capture: a workout sent by the AI coach, from the existing `-seedAICoach` launch seed (`ios/TigerWorkouts/Cloud/Store+Seed.swift:132`). Screen 6 is a new capture of a PT's invite or sent workout.

| # | Current (shot · headline · sub-line) | Proposed (shot · headline · sub-line) |
|---|---|---|
| 1 | 01-discover · Nearly 500 workouts · Benchmarks, strength, HIIT and NHS plans | new: AI coach's workout · **Use ChatGPT or Claude as your trainer** · It writes the workout, the app runs it |
| 2 | 02-workout · Plan every round · Exercises, rests and loads before you start | 01-discover · Or train on your own · Nearly 500 workouts built in |
| 3 | 03-timer · Hands-free timer · Tones and haptics at every change | 03-timer · Hands-free timer · Tones and haptics at every change (unchanged) |
| 4 | 04-today-target · Know today's target · Set from your last few attempts | 05-exercise · Every set logged · Loads in kilos or % of your max |
| 5 | 05-exercise · Dial in every set · Loads in kilos or % of your max | 04-today-target · Know today's target · Set from your last few attempts |
| 6 | 06-logbook · See your progress · Charts, records and one-rep max | new: PT invite · Or follow your PT · Accept an invite, get their workouts |
| 7 | 07-history · Every session, kept · Your whole training history | 06-logbook · See your progress · Charts, records and one-rep max |
| 8 | 08-me · See what you trained · A muscle map of the last four weeks | 07-history · Every session, kept · Your trainer coaches from it |

Dropped: 02-workout and 08-me, to make room for the AI and PT screens.

## Metadata

Current from `ios/fastlane/metadata/en-GB/`. Counts are characters; limits in brackets.

| Field | Current | Proposed |
|---|---|---|
| name.txt (30) | TigerWorkouts: Gym Timer & Log (30) | TigerWorkouts: Gym Coach & Log (30) |
| subtitle.txt (30) | Guided timer, every set logged (30) | Train alone, with AI or a PT (28) |
| promotional_text.txt (170) | Nearly 500 workouts with a timer that talks you through every set, rest and round, and a log of every load and rep. No account needed. (134) | Use ChatGPT or Claude as your trainer: it writes the workout, TigerWorkouts runs the timer and logs every set. Or train alone with nearly 500 workouts built in. (160) |
| keywords.txt (100) | hiit,wod,amrap,emom,tabata,interval,circuit,strength,lifting,weights,kettlebell,tracker,1rm,workout (99) | trainer,personal,hiit,wod,amrap,emom,tabata,interval,circuit,strength,lifting,weights,tracker,1rm (97) |
| description.txt, first paragraph (4000 for the whole) | TigerWorkouts runs your workout for you. Pick one, press Start, and the timer takes you through every exercise, rest and round, with a tone and a buzz at each change so you don't need to watch the screen. (204) | Use ChatGPT or Claude as your personal trainer. Connect it to your TigerWorkouts account and it reads what you have actually lifted, then writes your next session straight into the app. TigerWorkouts runs it: a timer that talks you through every set, rest and round, and a log of every load and rep. No AI? Train alone with nearly 500 built-in workouts, or with a human PT who sends you sessions by invite. (406) |

Keywords drop "kettlebell" and "workout" for "trainer" and "personal"; "gym", "coach", "log", "AI" and "PT" are already in the name and subtitle, which the App Store indexes too. The rest of the description stays; a later item adds an "AI TRAINER" section with the setup steps.

## Review risk

| Where | ChatGPT / Claude named? | Why |
|---|---|---|
| Keywords | No | 2.3.7: no trademarks or other app names in keywords |
| Name, subtitle | No ("AI", "PT" only) | 2.3.7: the name is the most policed field; a third-party mark there reads as affiliation |
| Screenshots, promotional text, description | Yes, as text | Says the app works with them. No ChatGPT or Claude logos and no screenshots of their apps (5.2.1: third-party marks only as a factual statement of compatibility, no implied endorsement) |

- **5.2.1:** every mention is "use ChatGPT or Claude as your trainer" / "connect it to your account", never "official", "by" or "powered by". The description says the assistant account is the user's own.
- **2.3.1:** a reviewer reads screen 1 and looks for a ChatGPT or Claude path in the app. Today there is none in the iPhone app, and the connector refuses accounts outside the allowlist (Reachable today above). The answer is items 1, 4 and 6 of "Before this headline ships": the connector open, an in-app link, and review notes walking the reviewer account through it. Shipping screen 1 without them invites a 2.3.1 rejection.
- **2.3.3:** screen 1 shows the app in use (the AI coach's workout inside TigerWorkouts), not a chat window.

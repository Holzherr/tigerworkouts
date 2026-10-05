Status: draft

# PT publishing: Hevy Coach against Tiger, and Hevy's main screens

Asked for 27 Sep 2026: "Review Hevy's PT/coach app and identify features and capabilities we can
learn from" and "Review Hevy's profile, onboarding, home and workout screens for inspiration to
improve". Serves G-13 (PT publishing, metric pt_client_runs) and G-06 for the home and workout rows.

Sources. No Hevy review existed in this repo before this one (`specs/` mentions an earlier "Hevy gap
list" that is not in the repo), and there is no `specs/hevy/` folder. The Builder has no web
access, so every Hevy claim below is the Builder's own knowledge and ends "(unverified)". Claims
checked against `specs/hevy/`: 0. Every Tiger cell cites a file on main after PR #59 (24e7850),
which shipped coaching on web and iOS and migration `legacy/supabase/migrations/0008_coaching.sql`.

## 1. The coach loop

| Step | Hevy Coach | Tiger today |
|---|---|---|
| Coach creates | Coach builds routines on a web dashboard with Hevy's exercise library, and can keep a library of templates to reuse (unverified). | The PT's own workouts, made in the normal editor; only workouts the PT owns can be sent (`0008_coaching.sql:96-98`). |
| Coach adds a client | Invite by email or link; the client joins inside the free Hevy app (unverified). | One invite link per client, shared from the dashboard (`src/features/coaching/components/coaching-routes.tsx:47-50`); single use, accepting is consent (`0008_coaching.sql:129-144`). |
| Coach assigns | Routines and multi-week programs pushed into the client's app; the coach can edit them later and the change follows (unverified). | One workout at a time with an optional note (`src/features/coaching/components/client-detail-screen.tsx:40-44`). A due date column exists (`0008_coaching.sql:39`) but no screen sets it. |
| Client is notified | Push notification in the Hevy app; the routines appear in their routine list (unverified). | No notification. The workout shows under "From your coach" at the top of Discover, not-done first (`src/features/coaching/components/from-coach.tsx:14-21`; iOS `ios/TigerWorkouts/Features/DiscoverView.swift:337`). |
| Client runs | Logs it with the normal Hevy workout logger (unverified). | Runs it with the timer; the session carries `startedFrom: 'coach'` (`src/App.tsx:676`, iOS `DiscoverView.swift:337`). |
| Coach sees the result | Client's workout history, per-exercise progress charts, personal records and body measurements on the dashboard (unverified). | Dashboard: per client, sessions this week, last active, quiet after 7 days (`src/features/coaching/rollup.ts:30-41`). Client page: each session's sets against what was prescribed, hit / short / skipped / extra (`rollup.ts:112-151`), and "done" on an assignment (`rollup.ts:68-70`). |
| Feedback | In-app messaging between coach and client (unverified). | Notes on a session or an assignment, both ways (`src/features/coaching/components/notes-thread.tsx`; client replies from Me, `coaching-routes.tsx:175-220`, and from the iOS finish screen, `ios/TigerWorkouts/Features/CoachViews.swift:61`). |
| Programme over weeks | Programs of several weeks with a schedule the client follows (unverified). | None. Each assignment stands alone. |
| Where the coach works | Web dashboard; a paid subscription priced by number of clients (unverified). | Web only (`src/features/coaching/components/coaches-page.tsx:34`); free, per G-13's "no payments". |

Gaps that matter for G-13, largest first: no notification, so a client who does not open the app
never sees the workout; no schedule or programme; no per-exercise trend for a client across
sessions. Payments and discovery are out (G-13 "Not now").

## 2. The proposed Tiger flow

**How a PT assigns a workout to a named client.** Built: an invite link per client, then an
in-app client list on the PT's dashboard, then "Send" on the client's page with a note
(`src/features/coaching/components/coach-dashboard-screen.tsx`, `client-detail-screen.tsx`). A link
beats email invites: the PT sends it on whatever channel they already use, and it needs no mail setup. **Recommended: keep the link
invite and the client list as built; add a day on each assignment (build item 2).**

**What the client sees, and whether they need an account.** Built: the join page names the PT,
says what they will see, and asks for a free passwordless account to link
(`src/features/coaching/components/join-screen.tsx:62-79`); without an account anyone can still run
a workout shared as a link, which G-13 requires. **Recommended: an account to be coached, none to
run a shared link, as built. A guest run of a shared link does not count as a client run.**

**How the PT sees that the client ran it, and what they did.** Built: the dashboard rollup and the
client page above, sessions against the prescription and a Done chip. **Recommended: as built. The
next thing a PT needs is the client's numbers over time per exercise; that waits until a PT uses
the dashboard weekly.**

**How a sent-workout session is marked for the snapshot.** Built twice: the session records
`startedFrom: 'coach'` when started from From your coach, and `agent_snapshot` counts
`pt_client_runs` as sessions whose owner has an assignment of that workout
(`0008_coaching.sql:193-195`). The snapshot rule counts a run from before the workout was sent and
a run after coaching ended; the client page's "done" (`rollup.ts:68-70`) only counts a session
started after the assignment. **Recommended: count a session when its owner has an assignment of
that workout created before the session started, the same rule as "done". Keep `startedFrom` as
the origin field; do not require it, because a client who repeats the workout from Saved or
history is still running what the PT sent.**

Smallest build that makes pt_client_runs trustworthy and gets runs to happen:

1. **pt_client_runs counts runs after the assignment only** — class chore, size S, G-13. Migration
   0009 replaces `agent_snapshot` (create or replace, no drop) with the rule above.
2. **A day on each assignment** — class product, size S, G-13. The PT picks a day when sending
   (`due_on` exists); From your coach shows "Today", "Thu" or "Overdue" and sorts by it.
3. **Up next leads with an undone coach workout** — class product, size S, G-13. The home card
   (`src/features/discover/components/next-up-card.tsx`) shows the newest not-done assignment
   before any recommendation, so the client sees it on opening the app without a notification.

Push notifications stay out of this round: they need APNs set up and a server to send, and the
three items above make the metric readable first.

## 3. The screens

**Profile.**
- Hevy: a profile with workout count, followers and following, a weekly chart of duration or
  volume, shortcuts to statistics, exercises, measures and calendar, then the workout feed (unverified).
- Tiger: web Me is avatar and sign-in state, four stat tiles, streak, body map, exercises and
  bodyweight (`src/features/profile/components/me-screen.tsx:41-46`), plus the creator-page card
  and "Coach clients" (`src/App.tsx:593`, `me-screen.tsx:90`). iOS Me has the same profile and a
  client-side Coach section, but no creator page and no way into coaching as a PT
  (`ios/TigerWorkouts/Features/MeView.swift:3-6`, `CoachViews.swift:179-180`).
- Change 1 (G-13): iOS Me gains the creator-page row (public workout count, opens the page) and
  "Coach clients", which opens the web dashboard, as web Me has.

**Onboarding.**
- Hevy: a short first run that asks units and a few training basics, then account creation, then
  suggests starter routines (unverified).
- Tiger: no onboarding. The first run is the landing page on web (`src/App.tsx:618`,
  `src/features/landing/components/landing-screen.tsx:44-50`) and the catalogue on iOS
  (`ios/TigerWorkouts/Features/DiscoverView.swift:168`); sign-in is one passwordless card
  (`src/features/auth/components/sign-in-card.tsx:22-29`). Intent and equipment, which shape
  For you, sit in settings (`src/features/profile/components/settings-sheet.tsx:36-37`).
- Change 2 (G-06): at App Store launch, a two-question first run (intent, equipment) that fills
  those settings before the first For you list. Not before: the two users today can set them in settings.

**Home.**
- Hevy: a feed of workouts from people you follow, with likes and comments; training starts from a
  separate Workout tab of routine folders, each with a Start button (unverified).
- Tiger: Discover is home, with the Up next card on top once there is history
  (`src/features/discover/components/next-up-card.tsx:32-37`) and Saved, For you and Search tabs
  (`src/features/discover/components/discover-screen.tsx:62-70`). Only Up next starts in one tap;
  For you cards open the workout page first.
- Change 3 (G-06): a Start button on each For you card, so a recommendation is one tap from home
  (counts toward home_reco_used).

**Workout.**
- Hevy: a set logger: one row per set with the previous session's weight × reps, a tick that starts
  the rest timer, and duration, volume and sets running at the top (unverified).
- Tiger: the guided timer, block and round in the header, elapsed top right, set rows filled from
  the plan with last time's set beside each and PR marks (`src/features/timer/components/timer-screen.tsx:80-83`,
  `timer-screen.tsx:200-208`); iOS follows it (`ios/TigerWorkouts/Features/TimerView.swift`).
- Change 4 (G-06): the header's elapsed line adds sets done of total ("12 of 20 sets"), so one
  glance between sets says how far through the session is.

Four changes in total; none is filed until Nick moves this spec to agreed.

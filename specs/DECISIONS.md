# Decisions

Append-only. One line per decision: `- <date> <who>: <decision>`. Builders append Nick's answers here in their PR; nobody rewrites history.

- 2026-09-06 Nick: rebrand from Workout Hub to TigerWorkouts; coral #ff4d2e, traced tiger mark V6, striped app icon.
- 2026-09-10 Nick: block gate, rest colour, loads carry over between sessions, no quick log, Saved first on the home screen.
- 2026-09-18 Nick: own repository with history; v0.9 kept under legacy/ until parity.
- 2026-09-22 Nick: iOS icon and in-app mark are two straight flat coral bars, #ff4d2e, with explicit dark and tinted icon variants; the web mark stays until the web-brand question is answered.
- 2026-09-22 Nick: turn the nightly database snapshot on the evening TW-009's PR merges, in the order in TW-010's Plan (apply 0004_agent_snapshot.sql, set agent_reader's password, add a supabase block to agent-team's apps/tigerworkouts/app.json); the password goes in the iMac config file next to MATHS_GARDEN_DB_PASSWORD, not the keychain, so the iMac reads it over SSH.

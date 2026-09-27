# Decisions

Append-only. One line per decision: `- <date> <who>: <decision>`. Builders append Nick's answers here in their PR; nobody rewrites history.

- 2026-09-06 Nick: rebrand from Workout Hub to TigerWorkouts; coral #ff4d2e, traced tiger mark V6, striped app icon.
- 2026-09-10 Nick: block gate, rest colour, loads carry over between sessions, no quick log, Saved first on the home screen.
- 2026-09-18 Nick: own repository with history; v0.9 kept under legacy/ until parity.
- 2026-09-22 Nick: iOS icon and in-app mark are two straight flat coral bars, #ff4d2e, with explicit dark and tinted icon variants; the web mark stays until the web-brand question is answered.
- 2026-09-25 Nick: For you ranks by the approved rules: a workout enters only if its creator has at least 2 sessions in history, or it shares 2 exercises, or it is saved and not done, or it is the next program day; creator match scores +10 per session over +2 per shared exercise; mid-program days of unstarted programs never show; six at most. The line-26 recommend test changes to expect Cindy absent after one Fran.
- 2026-09-22 Nick: one editor, the workout screen, press-and-drag per DESIGN.md, the separate form goes; web keeps DnD variant B (insertion line follows the finger), Classic, A and C go; mid-session the next block is editable below the running one, the engine replans slots from the cursor and keeps done actuals, Swift and TS one for one; editing a catalogue workout makes a silent copy. Spec: specs/unified-editing.md, two M items.
- 2026-09-26 Nick: creator pages — anyone gets a public page (tigerworkouts.com/#/c/<handle>) listing the workouts they made public; new workouts are private by default; visitors can do a public workout in the browser without an account, and sign up only to keep history; pages link to the app.
- 2026-09-26 Nick: new app icon — the tiger head (black and white) on full coral, iOS and web; replaces the two-band mark on the icon.

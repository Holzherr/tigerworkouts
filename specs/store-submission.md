Status: draft

# Claude directory submission: connector + plugin

Nick, 1 Nov 2026: get the TigerWorkouts MCP server and Claude plugin ready to submit to Anthropic's directories. This file holds the text to paste into the portal and what is left for Nick. Nothing has been submitted.

## Where and who

- Both go through **https://claude.ai/directory/manage → Submit new**: "MCP connector" for the server, "Plugin bundle" for the plugin (claude.com/docs/directory/publish, checked 1 Nov 2026).
- Needs a paid Claude plan; on Team/Enterprise only an Owner submits. Questions: mcp-review@anthropic.com (connectors), directory@anthropic.com (plugins).
- Plugin: the portal reads it from the GitHub repo (`Holzherr/tigerworkouts`, folder `plugin/`), which must be public before it goes live (it is). Connect GitHub with an account that can push to the repo.

## Requirements checked (1 Nov 2026)

Sources: claude.com/docs/connectors/building/submission, …/review-criteria, …/authentication, claude.com/docs/plugins/submit, …/pre-submission-checklist, support.claude.com/en/articles/13145358 (Software Directory Policy).

| Requirement | State |
|---|---|
| Remote server over `https://`, Streamable HTTP | done: `https://mcp.tigerworkouts.com/mcp` |
| OAuth: DCR or CIMD, PKCE S256, 401 + `WWW-Authenticate` with `resource_metadata` | done, checked live 1 Nov 2026 (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, 401 on unauthenticated `/mcp`) |
| Refresh token no longer valid → `invalid_grant` | done (specs/mcp.md, Auth) |
| Callbacks `https://claude.ai/api/mcp/auth_callback`, Claude Code loopback | accepted: DCR/CIMD take the client's own redirect URI; no allowlist to update |
| Every tool has `title`; `readOnlyHint: true` for reads, `destructiveHint: true` for anything that changes data | done in this PR: `create_workout`, `update_workout`, `log_session`, `claim_account` now `destructiveHint: true`; `mcp/test/plugin.test.ts` enforces it |
| Tool names ≤ 64 chars, reads and writes in separate tools, actionable errors | done (test checks name length; `run()` in `mcp/src/server.ts` turns failures into readable errors) |
| Privacy policy, terms, support contact | live: tigerworkouts.com/privacy/, /terms/, /support/; privacy updated in this PR (in-app feedback, Cloudflare) |
| Public documentation | live: https://mcp.tigerworkouts.com/; Claude page https://tigerworkouts.com/claude/ added in this PR |
| At least 3 example prompts | below |
| Test account with data, step-by-step access | **Nick** (see below) |
| MCP Apps listing: 3–5 PNG screenshots ≥ 1000 px wide, cropped to the app response, prompt given separately | **Nick** (the timer view is an MCP App) |
| Plugin: `.claude-plugin/plugin.json` with `name`, `description`, `author`, `version`; LICENSE; README ≥ 40 words; no `.DS_Store`; remote MCP `type: http` + `https://` | done; `claude plugin validate ./plugin` and `claude plugin validate .` pass (1 Nov 2026). Version 1.1.2 |

## Blocker: who can sign in

`ALLOWED_USER_IDS` in `mcp/wrangler.jsonc` holds only Nick's id. Anyone else who signs in with an email gets "Not open yet"; only "Start now" (anonymous) is open to everyone. A reviewer with a test account is refused until one of:

1. **Go public:** set `ALLOWED_USER_IDS` to `""` and `cd mcp && npm run deploy` (specs/mcp.md: "Going public").
2. **Reviewer only:** add the reviewer account's Supabase user id to `ALLOWED_USER_IDS` and deploy.

A directory listing means strangers connect, so option 1 is what launch needs; option 2 is enough for review.

## Reviewer test account (Nick)

The reviewer cannot receive email codes, so use a password:

1. Create an account with an email Nick controls (e.g. `review@…`), set a password in Supabase (Authentication → Users), confirm the email.
2. Fill it: a profile name and bodyweight, 4–6 own workouts (one private), 8–10 sessions over the last three weeks with loads and reps, so `list_sessions`, the weekly review and the coaching prompts have something to read.
3. Allow it (blocker above).

Access instructions to paste:

> 1. In Claude, add the TigerWorkouts connector and click Connect.
> 2. On the TigerWorkouts sign-in page, open "Use a password instead".
> 3. Email `<review email>`, password `<password>`. The account has three weeks of training history and saved workouts.
> 4. Anonymous path: on the same page, "Start now, no account needed" creates a temporary account with no sign-in.

## Connector listing text

- **Name:** TigerWorkouts
- **Slug:** `tigerworkouts`
- **One-liner (≤ 200):** Coaching from your real training history, new workouts written straight into the TigerWorkouts app, and a guided timer in the chat.
- **Description (≤ 2,000):**

  TigerWorkouts is a workout app with a guided timer, on the web and iPhone. Connected to Claude, it lets Claude coach you from what you have done, not what you meant to do.

  Claude can read your profile and training history (the loads, reps and times you logged), search your own workouts, public workouts and a catalogue of about 480 (benchmarks, lifting programmes, NHS plans, follow-along videos), and write new workouts into your account or change your own. It can run any workout now with an interactive timer in the chat that logs the session when you finish, or hand you a link that opens it on tigerworkouts.com with no sign-in.

  No account is needed to start: tap "Start now" when you connect and Claude works with a temporary account. Keep it later by giving your email; the same workouts then show up in the TigerWorkouts website and iPhone app. Temporary accounts are deleted after 7 days unless kept.

  Claude acts as you: it sees your own data and public workouts, nothing of anyone else's. New workouts are private unless you ask for them to be public.

- **Categories (1–5):** pick from the portal's list; closest fits are Health & fitness, Lifestyle, Productivity (the portal's list was not visible from the docs; unverified).
- **Documentation URL:** https://tigerworkouts.com/claude/
- **Privacy policy:** https://tigerworkouts.com/privacy/
- **Terms:** https://tigerworkouts.com/terms/
- **Support:** brambruesch@nickholzherr.com (https://tigerworkouts.com/support/)
- **Company:** Brambruesch Ltd, https://tigerworkouts.com
- **Icon:** `plugin/assets/logo.png` (1024×1024) or `public/icons/icon-512.png`
- **Server URL:** https://mcp.tigerworkouts.com/mcp
- **Reads/writes:** both. Reads profile, sessions, workouts, catalogue; writes workouts, sessions, and adds an email to a temporary account.
- **What users need first:** nothing; optionally a TigerWorkouts account (email).
- **Allowed link URIs (`ui/open-link`):** `https://tigerworkouts.com`, `https://mcp.tigerworkouts.com`, `https://testflight.apple.com`

### Use cases

1. Coaching from history: "what should I change", "what load next time".
2. Writing a workout into the app for tomorrow, using recent loads.
3. Finding a workout in the catalogue and running it now with the timer.
4. Week-on-week review of sessions, minutes and loads.

### Example prompts

1. "Look at my last month in TigerWorkouts and tell me what to change."
2. "Write me a 30-minute upper-body session for tomorrow using my last loads."
3. "Find a 20-minute kettlebell workout and start it."
4. "How did this week compare with last week?"
5. "Make me a beginner full-body routine I can do three times a week with dumbbells, and send me the link."

### Screenshots (Nick; MCP Apps listing)

3–5 PNGs ≥ 1000 px wide, each cropped to Claude's response with the timer view, with its prompt listed separately:

1. "Find a 20-minute kettlebell workout and start it." → timer view running.
2. "Write me a 30-minute upper-body session for tomorrow using my last loads." → the created workout summary.
3. "How did this week compare with last week?" → the weekly review.
4. End of a timer run → logged-session state with "Get the app" link.

## Data-handling answers (Nick decides)

- **First-party API:** yes; the server calls TigerWorkouts' own Supabase project as the user (row-level security), no third-party APIs.
- **Personal health data:** sessions can hold heart rate and bodyweight from Apple Health (iPhone app, opt-in), and the profile holds bodyweight; `list_sessions` returns logged loads and reps. Whether that counts as "personal health data" for the form is Nick's call; answering yes likely means closer review. The policy treats healthcare as high-risk (human in the loop, consumer disclosure); the terms and the /claude/ page already say workouts are not medical advice.
- **Stores conversations:** no.
- **Under 18:** Nick's call (no age gate exists).
- **Retention:** account data until the user deletes the account (Me → Delete account; migration 0006); anonymous accounts deleted 7 days after creation unless kept (migration 0009); OAuth grant (encrypted Supabase session) in Cloudflare KV until disconnected or expired.

## Plugin listing

The README in `plugin/` becomes the listing description. `plugin/.claude-plugin/plugin.json` carries `icon`, `documentationUrl` (now https://tigerworkouts.com/claude/), `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`. Submit as "Plugin bundle" from the repo, folder `plugin/`. Same data-handling answers as above.

## Effect of the annotation change

Claude always asks before a `destructiveHint: true` tool. Saving a workout, logging a session and keeping an account now prompt every time in Claude, including the timer view's own `log_session` call at the end of a run. ChatGPT reads the same hints.

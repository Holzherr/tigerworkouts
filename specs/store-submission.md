Status: ready for Nick to submit

# Claude directory submission: connector + plugin

Nick, 1 Nov 2026: get the TigerWorkouts MCP server and Claude plugin ready to submit to Anthropic's directories; Nick presses Submit. This file holds every value to paste into the portal and what is left for Nick. Nothing has been submitted.

## Nick's steps, in order

1. **Deploy the worker** with this PR's server changes: `cd mcp && npm run deploy`. Check `initialize` on `https://mcp.tigerworkouts.com/mcp` reports `version: "1.2.0"`.
2. **Decide access** ("Access control" below). For review alone, option B is enough.
3. **Reviewer account** ("Reviewer test account" below): create it, fill it, allow it, deploy.
4. **Test as a custom connector** in Claude: call every tool once (the portal's Test & launch step asks you to confirm this).
5. **Submit the connector**: https://claude.ai/directory/manage → Submit new → **MCP connector**, fields below.
6. **Submit the plugin**: same portal → Submit new → **Plugin bundle**, repo `Holzherr/tigerworkouts`, path `plugin`, branch `main`. Connect GitHub first (an account that can push to the repo). Validate, then submit.
7. After review: answer feedback in the portal; questions to mcp-review@anthropic.com (connector) or directory@anthropic.com (plugin).

## Requirements checked (1 Nov 2026)

Sources, read 1 Nov 2026: claude.com/docs/connectors/building/submission, …/review-criteria, claude.com/docs/plugins/submit, …/pre-submission-checklist, support.claude.com/en/articles/13145358 (Software Directory Policy).

| Requirement | State |
|---|---|
| Remote server, `https://`, Streamable HTTP | done: `https://mcp.tigerworkouts.com/mcp` |
| OAuth 2.0 discovery | checked live 1 Nov 2026: `/.well-known/oauth-authorization-server` 200 (PKCE S256, DCR at `/oauth/register`, CIMD supported), `/.well-known/oauth-protected-resource/mcp` 200, unauthenticated `POST /mcp` → 401 with `WWW-Authenticate: Bearer … resource_metadata=…`, DCR with `https://claude.ai/api/mcp/auth_callback` → 201 |
| Every tool has `title` and `readOnlyHint: true` or `destructiveHint: true` | done; `mcp/test/plugin.test.ts` enforces a title, all three hints, and read-only xor destructive |
| Tool names ≤ 64 chars, reads and writes in separate tools, no catch-all API tool | done |
| Descriptions describe the tool, no prompt-injection patterns | reviewed in this PR: the server instructions no longer tell Claude to push the iPhone app; it is offered when the chat cannot show the timer or the person asks about their phone |
| Actionable errors, never a bare "Internal Server Error" | done in this PR: unexpected failures and Supabase 5xx/gateway pages become one plain sentence with the support address (tested in `plugin.test.ts`); 4xx keep Supabase's message, trimmed |
| First-party API, domain matches the service | yes: TigerWorkouts' own Supabase project, called as the user; server on `mcp.tigerworkouts.com` |
| No money transfer, no AI media generation | yes |
| Privacy policy, terms, support reachable | 200 on 1 Nov 2026: https://tigerworkouts.com/privacy/, /terms/, /support/, /claude/, https://mcp.tigerworkouts.com/ |
| Public documentation | https://tigerworkouts.com/claude/ (this PR adds the AI-coach line and a tool list) |
| MCP App carousel: 3–5 PNG ≥ 1000 px, cropped to the app, prompts given separately | done: `specs/store-assets/01–04` (below) |
| Test credentials for a fully populated account | **Nick** |
| Plugin: `.claude-plugin/plugin.json` with name/description/author/version, LICENSE, README ≥ 40 words, no `.DS_Store`, remote MCP `type: http` + `https://`, no hooks or launchers, files < 256 KiB | done; `claude plugin validate ./plugin` and `claude plugin validate .` pass (1 Nov 2026) |
| Plugin name lowercase, not reserved, not someone else's brand | `tigerworkouts`: ok |

## Access control (Nick decides; not changed in this PR)

`mcp/wrangler.jsonc` today:

```jsonc
"ALLOWED_USER_IDS": "71ee1910-ef0a-471d-81bb-345ce7b9c2e3",   // Nick only
"ANONYMOUS_SIGNUP": "true",
```

What that means now:
- **Email sign-in:** only Nick. Anyone else gets the "Not open yet" page and no grant. Checked again on every `/mcp` call and token refresh (`allowed()` in `mcp/src/access.ts`).
- **"Start now, no account needed":** already open to everyone. `ANONYMOUS_SIGNUP` admits anonymous grants regardless of the allowlist, before and after they are claimed with an email.

| Option | Change | Effect |
|---|---|---|
| **A. Public** (what a live listing needs) | `"ALLOWED_USER_IDS": ""`, then `cd mcp && npm run deploy` | Every TigerWorkouts account (web and iPhone users, any new email sign-up) can connect Claude with their email. Each still sees only their own data plus public workouts (Supabase row-level security, as in the apps). Nothing else changes. Undo: put the ids back and deploy; access ends within one token lifetime. |
| **B. Reviewer only** | `"ALLOWED_USER_IDS": "71ee1910-ef0a-471d-81bb-345ce7b9c2e3,<reviewer user id>"`, then deploy | Reviewers can sign in with the test account. Directory users who sign in with an email still get "Not open yet" and can only use "Start now". Fine for review, poor for a live listing. |
| **C. As is** | none | Reviewers can only use "Start now" (an empty account), which fails "fully populated account". |

Recommendation: B for submission, A before the listing goes live. After the automatic scan the connector is listed as Community by default, possibly with no human step, so A may be needed soon after submitting.

## Reviewer test account (Nick)

Reviewers cannot receive email codes, so the account uses a password.

1. Create an account with an email Nick controls (e.g. `review@tigerworkouts.com`), set a password in Supabase → Authentication → Users, and confirm the email.
2. Fill it: profile name and bodyweight; 4–6 own workouts (one private); 8–10 sessions over the last three weeks with loads and reps, so `list_sessions`, the weekly review and the coaching prompts have something to read. Quickest: connect Claude as that account and ask it to write and log them.
3. Allow it (option B or A) and deploy.

**Test & launch → access instructions (paste):**

> 1. In Claude, add the TigerWorkouts connector and click Connect.
> 2. On the TigerWorkouts sign-in page, open "Use a password instead".
> 3. Email `<review email>`, password `<password>`. The account has three weeks of training history and saved workouts.
> 4. Try: "Look at my last month in TigerWorkouts and tell me what to change", then "Find a 20-minute kettlebell workout and start it" (timer view in the chat; End logs the session).
> 5. Anonymous path: on the same sign-in page, "Start now, no account needed" creates a temporary account with no sign-in (deleted after 7 days unless kept with an email via `claim_account`).
>
> Write tools (`create_workout`, `update_workout`, `log_session`, `set_ai_coach`, `claim_account`) only touch the signed-in account. `claim_account` sends a confirmation email; try it from the anonymous path.

## Connector form (MCP connector)

**1. Connection**
- Server URL: `https://mcp.tigerworkouts.com/mcp` (one URL for everyone; leave "Users connect to different URLs" off).

**2. Tools** sync from the server: 12 tools and 1 resource. `claim_account` exists only on anonymous connections, so the portal may show 11.

| Tool | Title | Kind | One line |
|---|---|---|---|
| `get_profile` | Profile | read | Name, units, bodyweight, training maxes, AI coach, and whether the account is still anonymous. |
| `list_sessions` | Training history | read | Recent sessions with the loads, reps and sets actually done. |
| `get_session` | Session | read | One session in full, with the workout it ran. |
| `list_workouts` | Find workouts | read | Search own, public and catalogue workouts (~480) by words, tag, exercise and length. |
| `get_workout` | Workout | read | One workout's outline, runsheet, links and the versions the user ran. |
| `search_exercises` | Exercise library | read | Exercise keys, units and cues for writing workouts. |
| `preview_workout_url` | Preview link | read | A no-sign-in tigerworkouts.com link for a saved workout or a draft. |
| `start_workout` | Start workout | read (MCP App) | Shows the interactive timer in the chat for a saved workout, a draft or a plain-text plan. |
| `create_workout` | Create workout | write | Saves a new workout to the account, sent from the user's AI coach. |
| `update_workout` | Update workout | write | Changes one of the user's own workouts or its visibility. |
| `set_ai_coach` | AI coach | write | Names the AI coach, or switches it off or on. |
| `log_session` | Log session | write | Saves a finished session to the history (the timer calls it at the end). |
| `claim_account` | Keep this account | write | Adds an email to a "Start now" account so it is kept. |

Resource: `ui://tigerworkouts/timer-v1.html` (the timer view, `text/html;profile=mcp-app`).

**3. Listing**
- **Server name:** TigerWorkouts
- **One-liner (≤ 200):** Coaching from your real training history, new workouts written straight into the TigerWorkouts app, and a guided timer in the chat.
- **Description (≤ 2,000):**

  TigerWorkouts is a workout app with a guided timer, on the web and iPhone. Connected to Claude, it lets Claude coach you from what you have done, not what you meant to do.

  Claude can read your profile and training history (the loads, reps and times you logged), search your own workouts, public workouts and a catalogue of about 480 (benchmarks, lifting programmes, NHS plans, follow-along videos), and write new workouts into your account or change your own. Workouts Claude writes arrive in the app from your AI coach, under a name you choose; remove the AI coach any time. Claude can run any workout now with an interactive timer in the chat that logs the session when you finish, or hand you a link that opens it on tigerworkouts.com with no sign-in.

  No account is needed to start: tap "Start now" when you connect and Claude works with a temporary account. Keep it later by giving your email; the same workouts then show up on the TigerWorkouts website and iPhone app. Temporary accounts are deleted after 7 days unless kept.

  Claude acts as you: it sees your own data and public workouts, nothing of anyone else's. New workouts are private unless you ask for them to be public. Workouts and suggestions are not medical advice.

- **Categories (1–5):** pick from the portal's list; closest fits are Health & fitness, Lifestyle, Productivity (the list is not in the public docs; unverified).
- **Documentation URL:** https://tigerworkouts.com/claude/
- **Privacy policy URL:** https://tigerworkouts.com/privacy/
- **Support contact:** brambruesch@nickholzherr.com (page: https://tigerworkouts.com/support/)
- **Icon:** `plugin/assets/logo.png` (PNG, 1024×1024, 17 KB); smaller fallback `plugin/assets/icon.png` (PNG, 512×512).
- **Slug (permanent once published):** `tigerworkouts`
- **Allowed link URIs** (the timer opens links with `ui/open-link`; only origins we own may be listed): `https://tigerworkouts.com`, `https://mcp.tigerworkouts.com`. TestFlight (`https://testflight.apple.com`) is Apple's, so leave it off; the "Get the app" link then shows Claude's confirm prompt.

**MCP App carousel screenshots** (PNG, 1120 px wide, cropped to the timer view; rendered from this repo's widget in a local MCP Apps host; paste each prompt separately):

| File | Size | Prompt |
|---|---|---|
| `specs/store-assets/01-timer-ready.png` | 1120×474 | "Find a 20-minute kettlebell workout and start it." |
| `specs/store-assets/02-timer-running.png` | 1120×872 | "Start that circuit and time me." |
| `specs/store-assets/03-timer-rest.png` | 1120×872 | "Run Circuit Club · Three Rounds with the timer." |
| `specs/store-assets/04-timer-done.png` (dark) | 1120×508 | "Start a 15-minute circuit and log it when I'm done." |

`specs/store-assets/05-claude-page.png` (1280×1959) is the /claude/ documentation page, for reference, not the carousel. To regenerate: load `mcp/src/generated/widget.json` in an iframe that answers `ui/initialize` and sends `ui/notifications/tool-result` with `start_workout`'s `structuredContent`; Playwright with `--mute-audio` and a fake clock.

**4. Use cases**
1. Coaching from history: what to change, what load to use next time.
2. Writing tomorrow's workout into the app from recent loads, sent from the AI coach.
3. Finding a workout in the catalogue and running it now with the timer in the chat.
4. Week-on-week review of sessions, minutes and loads.

Example prompts:
1. "Look at my last month in TigerWorkouts and tell me what to change."
2. "Write me a 30-minute upper-body session for tomorrow using my last loads."
3. "Find a 20-minute kettlebell workout and start it."
4. "How did this week compare with last week?"
5. "Make me a beginner full-body routine I can do three times a week with dumbbells, and send me the link."

- **What users need first:** nothing; "Start now" works without an account. Optionally a TigerWorkouts account (email).
- **Reads or writes:** both. Reads profile, sessions, workouts and the catalogue; writes workouts, sessions and the AI coach's name, and adds an email to a temporary account.

**5. Company:** Brambruesch Ltd, https://tigerworkouts.com; primary contact Nick Holzherr, brambruesch@nickholzherr.com.

**6. Authentication:** Required, OAuth 2.0. Users sign in with email (6-digit code) or password, or "Start now" (anonymous). Dynamic client registration and client ID metadata documents both work, so leave Anthropic-held client credentials empty.

**7. Data handling (Nick decides)**
- **API:** your own (first-party). The server calls TigerWorkouts' Supabase project as the signed-in user; no third-party APIs.
- **Personal health data:** sessions can hold heart rate and bodyweight from Apple Health (iPhone app, opt-in), the profile holds bodyweight, and `list_sessions` returns loads and reps. Answering yes likely means closer review; the policy treats health as higher risk (human in the loop, consumer disclosure). The terms and /claude/ page say workouts are not medical advice.
- **Sponsored content:** no.
- **Stores conversations:** no.
- **Retention:** account data until the user deletes the account (Me → Delete account); anonymous accounts deleted 7 days after creation unless kept; OAuth grant (encrypted Supabase session) in Cloudflare KV until disconnected or expired.
- **Under 18:** Nick's call (no age gate).

**8. Test & launch:** the access instructions above; confirm every tool was run (Nick's step 4).

**9. Compliance:** seven acknowledgements; all hold for this server.

## Plugin form (Plugin bundle)

- **Repository:** `Holzherr/tigerworkouts` (public). **Plugin path:** `plugin`. **Branch:** `main`.
- **Listing details** come from `plugin/.claude-plugin/plugin.json` (version **1.2.0**, `displayName` TigerWorkouts, icon `./assets/icon.png`, docs https://tigerworkouts.com/claude/, support, privacy and terms URLs) and `plugin/README.md`. No version bump in this PR: no plugin file changed.
- **Contents:** 4 Markdown skills (`get-started`, `coach`, `train-now`, `weekly-review`) and the remote connector `https://mcp.tigerworkouts.com/mcp` (`plugin/.mcp.json`). No hooks, no local code, no package installs.
- **Data handling:** reads personal data (the user's own TigerWorkouts data, through the connector); sends data only to the declared connector; retention as above; under 18: Nick's call.
- **Compliance:** four acknowledgements; contact brambruesch@nickholzherr.com.
- **Updates:** GitHub push webhook (default; needs repo admin). Raise `version` in both `plugin/.claude-plugin/plugin.json` and `plugin/plugin.json` with every plugin release (a test checks they match).

## Effect of the destructive hints

Claude asks before every `destructiveHint: true` tool: saving a workout, logging a session, naming the AI coach and keeping an account prompt every time, including the timer view's own `log_session` at the end of a run. ChatGPT reads the same hints.

## Checked locally (1 Nov 2026)

- `mcp`: 61 tests pass, type-check clean. Root: 61 files, 614 tests pass.
- `wrangler dev`: discovery 200, unauthenticated `/mcp` 401 with `WWW-Authenticate`, DCR 201. Authenticated calls were not run locally: sign-in goes through the production Supabase project.
- Over MCP against the in-memory Supabase the tests use: `initialize`, `tools/list`, every read tool, `create_workout`, `start_workout`, `log_session`, `set_ai_coach`, and two error cases (unknown workout id, unknown exercise key) return the expected results.
- Timer view in a local MCP Apps host: loads the workout, runs to the end, calls `log_session` and shows "Saved to your TigerWorkouts history."

Status: building

# Agent surface: MCP server

Nick, 22 Sep gym session: "I want to be able to ask Claude or ChatGPT for coaching based on my workouts — and have it create new sessions for me." And on 23 Sep: "design it in such a way that we can make public use it later once I know it works."

## What it is

A remote MCP server (Streamable HTTP) at **https://mcp.tigerworkouts.com/mcp**, a Cloudflare Worker in `mcp/`. An assistant connected to it acts as one signed-in TigerWorkouts user: it reads their profile and training history, searches their workouts, public workouts and the catalogue, and writes workouts into their account.

Landing page for people and agents: https://mcp.tigerworkouts.com/ (and `/llms.txt`, the same in plain text).

## Auth — built for public, closed for now

- **OAuth 2.1** via `@cloudflare/workers-oauth-provider`: discovery metadata (RFC 9728 + RFC 8414), client registration by Client ID Metadata Document or Dynamic Client Registration, PKCE (S256), refresh-token rotation. Grants and tokens live in KV (`OAUTH_KV`), tokens stored hashed, props encrypted.
- **Identity is the TigerWorkouts Supabase account.** `/authorize` shows the connecting app's name and asks for the email; Supabase emails a 6-digit code (the same sign-in as the app); the worker verifies it and stores the Supabase session (access + refresh token) in the grant's encrypted props.
- **Row-level security does the authorisation.** Every Supabase call uses the anon key plus the user's own access token. No service-role key exists in the worker.
- **Token lifetimes follow Supabase.** A client access token lives until 2 minutes before the Supabase token expires; when the client refreshes, the worker refreshes the Supabase session and rewrites the props. A dead Supabase session makes the refresh fail with `invalid_grant`, and the client asks the person to reconnect.
- **Allowlist.** `ALLOWED_USER_IDS` (a var in `mcp/wrangler.jsonc`) holds Nick's id. Anyone else who signs in gets a "Not open yet" page and no grant; the check repeats on every refresh and every `/mcp` call, so removing an id cuts access within one token lifetime. **Going public = set `ALLOWED_USER_IDS` to `""` and deploy.**
- **Google sign-in** is built but off (`GOOGLE_SIGNIN: "false"`). It needs `https://mcp.tigerworkouts.com/callback` added to Supabase → Authentication → URL Configuration → Redirect URLs; until then Supabase would send the person to tigerworkouts.com instead. Then flip the var to `"true"` and deploy.
- **Static bearer token fallback: not built.** Claude (web, desktop, Code) and ChatGPT developer mode all do MCP OAuth, so it has not been needed. If a client turns up that cannot, add `resolveExternalToken` to the provider in `mcp/src/index.ts`: compare the bearer to a `STATIC_TOKEN` secret (`wrangler secret put`) and return props for a Supabase session kept in a second secret. It would bypass per-user sign-in, so it stays single-user and never ships once public.

## Tools

| Tool | Reads/writes | Notes |
|---|---|---|
| `get_profile` | read | name, units, bodyweight, training maxes, saved ids, 30-day session count |
| `list_sessions` | read | newest first; per exercise: load used, incline, reps per set, success. Filters: `since`, `until`, `workoutId`, `limit` |
| `get_session` | read | one session plus the outline of its workout |
| `list_workouts` | read | own (`owner: me`, with `public`), others' public, catalogue (484 from `imports/`); filters: scope, query, source, tag, exercise, minutes |
| `get_workout` | read | outline + full runsheet + `canEdit` + app link |
| `search_exercises` | read | library + the user's custom exercises; keys for `create_workout` |
| `create_workout` | write | **private by default** (`workouts.public = false`); returns `appUrl` and `previewUrl` |
| `update_workout` | write | own only; full runsheet replacement and/or `public` flip; catalogue/others' → "copy it with create_workout" |
| `preview_workout_url` | read | no-sign-in link for a saved workout or an unsaved draft |

Tool descriptions carry what a runsheet is, the units, every `forMode` and block mode, and a worked example; the server's `instructions` give the coaching flow.

### Validation

`mcp/src/runsheet.ts` is a zod schema keyed by the model's own types (`Record<ForMode, …>`, `Record<BlockMode, …>` …), so a mode added to `src/features/runsheet/model.ts` without adding it here fails the type-check. `normalise()` resolves exercise keys against the app's library (plus the user's custom exercises), fills ids and block names the way the editor does, checks the timer's rules (amrap needs `timeCapSec`, ladder needs `ladder`, segment needs `startSeconds`, bodyweight takes no target) and returns the model's `Runsheet`. Every problem is listed at once so an agent can fix them in one retry.

### Shared with the web app, not copied

To make that possible without duplicating code, four pure pieces moved out of browser-bound files (behaviour unchanged, the app imports them back):
- `src/features/workouts/hydrate.ts` — catalogue JSON → Runsheet (was inside `imported.ts`, which uses Vite's `import.meta.glob`)
- `src/features/cloud/rows.ts` — `fromRow` / `workoutFromRow`, v0.9 rows included (was inside `sync.ts`, which holds the Supabase client)
- `src/features/share/link.ts` — the share-link encoder (was inside `share.ts`, which reads `location`)
- the catalogue is bundled from `imports/` by `mcp/scripts/catalogue.mjs` into a git-ignored file before every dev, test, type-check and deploy.

## No-login preview

**Now:** `previewUrl` is the app's existing share link, `https://tigerworkouts.com/#/import/<runsheet>`. It opens with no sign-in and shows title, author, length and "Save to my workouts"; after Save the workout page and timer work without an account (saved to the device). It works for private workouts and unsaved drafts because the runsheet travels in the link.

**Later (not built):** a proper preview page, `#/preview/<runsheet>`, that shows the full list (the workout page's own list brick, read-only) and a "Try the timer" button that runs it without saving anything, with "Save to my workouts" at the end. Reuses `decodeShared`, the workout preview screen and the runner. Small web change, but it touches App routing, which other branches are also changing, so it waits.

## Operating it

- Deploy: `cd mcp && npm run deploy` (needs `wrangler login` on Nick's Cloudflare account). CI (`.github/workflows/mcp.yml`) type-checks and tests; it does not deploy.
- Custom domain `mcp.tigerworkouts.com` is declared in `wrangler.jsonc` (`custom_domain: true`); wrangler created the DNS record and certificate on first deploy.
- Logs: Cloudflare dashboard → Workers → tigerworkouts-mcp → Observability (enabled).
- Revoke a connection: remove the connector in the assistant; to cut someone off server-side, take their id out of `ALLOWED_USER_IDS` and deploy.

## Open questions / known gaps

- The web app's sync upserts every dirty own workout with `public: true` (`src/features/cloud/sync.ts`). A private workout made here becomes public the first time it is edited in the web app. The visibility work on another branch is expected to fix that; until it lands, "private by default" holds only until an edit in the app.
- Sessions can't be written (no `log_session`) — deliberately left out until coaching reads are proven.
- Imperial units are display-only in the app; the tools speak kg.

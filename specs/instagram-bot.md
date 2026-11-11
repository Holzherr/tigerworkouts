Status: building

# Instagram bot: @tigerworkouts answers with the workout

## Nick's asks (7 Nov 2026)

- "i want it to work like unroll did on twitter -- any user @tigerworkouts and it responds with the link to the workout".
- Trigger: "Comment @mention + DM". A public @tigerworkouts comment under an Instagram reel gets a reply under the reel with the workout link. A reel shared to @tigerworkouts by DM gets the link back by DM. DM is also the fallback when comment replies are rate-limited.
- Publishing: "Instant link, quiet catalogue". The requester gets a working link at once; the workout shows on the creator page and in search only after Nick approves it in an admin queue.
- Accounts: "Neither yet". No @tigerworkouts Instagram account and no Meta app exist. Built and tested with mocks; Nick creates the accounts from the checklist below.
- Cost: each new reel costs one Claude API call (about a cent); Nick chose to go ahead. A reel asked for again reuses the workout it already has (no second call).

Builds on creator imports (creator-imports.md): an import is credited "Adapted from @handle · original post ↗" and never looks like the creator published it.

## As built

- **Where:** routes on the MCP worker (`mcp/src/instagram/`), not a worker of its own. The bot needs what that worker already has: the runsheet schema and `normalise`, the exercise library, `createCredited`'s credit rules, KV, and the admin tools Nick uses from his Claude app. One deploy, one place for the import rules.
  - Webhook: `https://mcp.tigerworkouts.com/instagram/webhook` (GET verification, POST events).
  - Short link in replies: `https://mcp.tigerworkouts.com/i/<id>`.
  - Bot sign-in: `https://mcp.tigerworkouts.com/bot/connect`.
- **Writes as Nick, through row-level security.** No service-role key. Nick signs the bot in once at `/bot/connect` with an email code; only `INSTAGRAM_IMPORT_OWNER` (his id, also in `ADMIN_USER_IDS`) is accepted. That Supabase session lives in KV (`bot:session`) and is refreshed when it nears expiry.
- **Pipeline** (`pipeline.ts`), run after the 200 with `ctx.waitUntil`:
  1. Each comment or DM is answered at most once (`ig:event:<id>` in KV, 30 days), so Meta's retries change nothing.
  2. Per-requester limit: 5 an hour (a DM sender; a comment's reel when the commenter is unknown). Replies: 200 an hour overall. New reels sent to Claude: 100 a day.
  3. Finds the reel: `mentioned_comment` (comment mention), `mentioned_media` (caption mention), or the media id in a shared reel.
  4. Dedupe by media id and by the permalink's shortcode. A known reel gets its link again with no Claude call. A reel with no workout gets the same polite answer. A rejected one gets "not available".
  5. A new reel: one Claude call (`extract.ts`). The model returns JSON in `create_workout`'s shape. The same zod schema and `normalise` check it against the real exercise keys; a failing reply gets one repair turn listing every problem. A description sharing 8 words in a row with the caption is dropped.
  6. Saved as a credited import owned by Nick, **pending**: a private row with `source.review: "pending"` (`Source.review` in `src/features/runsheet/model.ts`). No migration; it lives in the runsheet jsonb.
  7. The reply has the short link. A failed comment reply is retried as a private reply to that comment.
- **Pending link.** `/i/<id>` redirects a pending import to the app's share link (`#/import/<runsheet>`). It opens for anyone, signed in or not. An approved import redirects to `#/w/<id>`; a rejected one shows "Not available".
- **Pending stays out of the catalogue.** The row is private, so RLS hides it from everyone but Nick. `creditedCreators` lists adapted workouts only once public, so creator pages and search skip it, and `list_workouts` for anyone else never returns it.
- **Admin queue** (MCP, listed only to admins):
  - `list_pending_imports`
  - `approve_import`: public, `review` cleared
  - `reject_import`: row deleted
  - Edits go through `update_workout`, which keeps the import pending.
- **Model:** `claude-haiku-5-5` (var `INSTAGRAM_MODEL`), effort low. Picked over Sonnet/Opus because the job is extraction. A reel is about 7k input tokens (rules plus the 399-exercise library, prompt-cached) and 1–2k output. At $0.10 / $0.50 per million tokens that is about $0.002 a reel, $0.004 with a repair turn. Sonnet 5.5 would be about $0.03.
- **Without secrets it does nothing.**
  - No `INSTAGRAM_APP_SECRET`: a POST is logged and answered 200.
  - No `INSTAGRAM_VERIFY_TOKEN`: the GET handshake answers 503.
  - No token or account id: jobs are logged, nothing is sent.
  - No `ANTHROPIC_API_KEY`, or the bot not connected: known reels are still answered; new ones are logged and left unanswered.
- **Logs:** every event, job, skip, extraction and reply is a JSON line starting `{"ig":…}` in Workers Observability.
- **Tests:** `mcp/test/instagram.test.ts` covers fixture payloads from Meta's examples, the signature, dedupe, rate limits, pending exclusion, admin gating, and Claude mocked.

## Instagram API facts (Meta's docs, checked 7 Nov 2026)

Docs base: `https://developers.facebook.com/documentation/instagram-platform/` (written below as `IP/`).

- **Three setups** (`IP/overview`):
  - Instagram API with Instagram Login (`graph.instagram.com`, no Facebook Page).
  - With Facebook Login (`graph.facebook.com`, a Facebook Page linked to the account).
  - Unified Login (`graph.facebook.com`, system-user token, a business portfolio, no Page).
  - The overview marks Mentions and Messaging supported on all three. Current Graph API version: v27.0.
- **Mentions are documented end to end only for Facebook Login (and Unified Login)** (`IP/instagram-api-with-facebook-login/mentions`): the `mentions` webhook field, `mentioned_comment`, `mentioned_media`, `POST /{ig-user-id}/mentions`.
  - Under Instagram Login, `mentions` is "included in the `comments` webhook notification" (`IP/webhooks/fields`).
  - Its mentions guide lists only `/tags` and `POST /mentions` (`IP/instagram-api-with-instagram-login/mentions`).
  - The code handles both payloads; the checklist uses **Facebook Login**.
- **Webhooks** (`IP/webhooks/setup`, `IP/webhooks/examples`):
  - Verification is `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`; answer with the challenge.
  - Events carry `X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body with the App Secret>`. `"object": "instagram"`.
  - Changes (comments, mentions) are retried for up to 36 hours.
  - Messaging events must get a 200 within about 5 seconds. After an hour of failures the app is unsubscribed (`/documentation/business-messaging/messenger-platform/webhooks`).
  - The app must be Live. The media owner's account must be public.
- **Fields:**
  - Facebook Login: `comments`, `live_comments`, `mentions`, `story_insights`.
  - Instagram Login: `comments`, `messages`, `message_echoes`, … (`IP/webhooks/fields`).
- **Subscribe the account:** `POST /{page-id}/subscribed_apps` with a Page token under Facebook Login, or `POST /{ig-id}/subscribed_apps?subscribed_fields=comments,messages` under Instagram Login (`IP/webhooks/setup`).
- **Mention payload (Facebook Login):** `{"field":"mentions","value":{"comment_id":"…","media_id":"…"}}`. A caption mention has `media_id` only (`IP/webhooks/examples#mentions-on-comments`).
- **Reading the comment and reel:**
  - Comment: `GET /{ig-user-id}?fields=mentioned_comment.comment_id(<id>){id,text,timestamp,media{…}}` (`IP/instagram-graph-api/reference/ig-user/mentioned_comment`).
  - Caption mention: `mentioned_media.media_id(<id>){caption,username,…}` (`…/mentioned_media`).
  - For media we did not post, `username` is returned instead of `owner`. Captions come back with the @ stripped.
  - `permalink` inside these is listed in the July 2026 changelog as "returned as normal" (`IP/changelog`), not in the field table.
- **Replying to a mention:** `POST /{ig-user-id}/mentions` with `media_id`, `comment_id`, `message`. It appears as a sub-thread comment; omit `comment_id` for a caption mention (`…/ig-user/mentions`).
  - Facebook Login permissions: `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`, `pages_show_list`.
- **DMs** (`IP/webhooks/examples`, `IP/webhooks/new`, `IP/instagram-api-with-instagram-login/messaging-api`):
  - Shares arrive as `message.attachments[]` with `type` `ig_reel` / `reel` / `ig_post` / `share` (deprecated after Feb 2026).
  - `ig_post` carries `ig_post_media_id` and `title`.
  - For `ig_reel` the docs show only `payload.url`: "Only the URL for the shared media or post is included".
  - Send: `POST /{node}/messages {"recipient":{"id":"<IGSID>"},"message":{"text":"…"}}`. Text is at most 1000 bytes; only within 24 hours of the person's last message.
  - Our own messages come back with `is_echo: true` and are ignored.
  - Under Facebook Login the node is the Page (Messenger API for Instagram, Page access token with `instagram_manage_messages`; `/documentation/business-messaging/instagram-messaging/get-started`).
- **Messages toggle:** the account must turn on Instagram Settings > Messages and story replies > Message controls > Connected Tools > Allow Access to Messages (same page, #connected-tools-toggle).
- **Rate limits** (`IP/overview#rate-limiting`):
  - 4800 × impressions calls per 24 h per app-user pair.
  - Send API 100 calls/s.
  - Private replies 750 an hour.
  - No limit is documented for mention replies.
- **Access** (`IP/app-review`, `IP/overview`):
  - Standard Access covers accounts you own or manage, with no App Review. Testers need a role on the app.
  - Advanced Access (anyone's comments mentioning us, under Live mode) needs App Review and Business Verification.
  - App Review asks for:
    - app icon 1024×1024
    - privacy policy URL
    - category
    - contact email
    - reviewer steps
    - per permission, a description and a screencast
    - at least one successful API call per permission

## Setup checklist for Nick

1. **Instagram account.** Create @tigerworkoutsdotcom (@tigerworkouts was taken, 11 Nov 2026). Settings → Account type → switch to **Professional** (Business). Keep it public.
2. **Facebook Page.** Create a "TigerWorkouts" Facebook Page and link it to the Instagram account (Instagram → Settings → Accounts Center, or the Page's Settings → Linked accounts → Instagram).
3. **Allow messages via API.** In the Instagram app: Settings → Messages and story replies → Message controls → Connected tools → turn on **Allow access to messages**.
4. **Meta app.** At developers.facebook.com → My Apps → Create app. Pick the business type, use case "Other" (or "Manage messaging & content on Instagram"), and connect it to a business portfolio (Brambruesch or TigerWorkouts). Under the Instagram product choose **API setup with Facebook login**. Add Messenger → Instagram settings if the dashboard offers it.
5. **Basic settings.**
   - Privacy policy URL: the TigerWorkouts privacy page.
   - App icon: 1024×1024 tiger icon.
   - Category: Health & fitness.
   - Contact email.
   - Copy the **App Secret** (Settings → Basic).
6. **Permissions.** Request:
   - `instagram_basic`
   - `instagram_manage_comments`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - (`business_management` if the dashboard asks)
7. **Token.**
   1. In Graph API Explorer (your app, those permissions), get a user token.
   2. Exchange it for a long-lived one: `GET https://graph.facebook.com/v27.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<app id>&client_secret=<app secret>&fb_exchange_token=<token>`.
   3. Get the Page token with `GET /me/accounts`. A Page token from a long-lived user token does not expire.
   4. Note the Page id. Get the IG user id with `GET /<page-id>?fields=instagram_business_account`.
8. **Webhook.** App dashboard → Webhooks → Instagram:
   - Callback URL `https://mcp.tigerworkouts.com/instagram/webhook`.
   - Verify token: any long random string (the same one as in step 9).
   - Subscribe to `mentions` and `comments`.
   - Under Messenger → Instagram settings, subscribe the webhook to `messages`.
   - Then subscribe the Page: `POST https://graph.facebook.com/v27.0/<page-id>/subscribed_apps?access_token=<page token>` (`IP/webhooks/setup`). Meta's response is `{"success": true}`; if it asks for `subscribed_fields`, pass the fields from this step.
9. **Secrets** (in `mcp/`, never committed):
   ```
   npx wrangler secret put INSTAGRAM_VERIFY_TOKEN     # the string from step 8
   npx wrangler secret put INSTAGRAM_APP_SECRET       # App Secret, step 5
   npx wrangler secret put INSTAGRAM_ACCESS_TOKEN     # Page token, step 7
   npx wrangler secret put ANTHROPIC_API_KEY          # console.anthropic.com key
   ```
10. **Vars** in `mcp/wrangler.jsonc`:
    - `INSTAGRAM_ACCOUNT_ID` = the IG user id
    - `INSTAGRAM_SEND_NODE` = the Page id (DMs are sent from the Page under Facebook Login)
    - Then `npm run deploy`.
11. **Connect the bot to your account.** Open https://mcp.tigerworkouts.com/bot/connect and sign in with your TigerWorkouts email (code). Only your admin account is accepted.
12. **Test in dev mode.** Under App roles → Roles, add a second Instagram/Facebook person as Tester, and accept the invite.
    - From that account, comment "@tigerworkoutsdotcom" under a public workout reel.
    - Then DM a reel to @tigerworkoutsdotcom.
    - Check the replies, and the Observability logs (`{"ig":…}` lines).
    - Then, in your Claude app: "list pending imports", and approve one.
13. **App Review** (to answer everyone, not only testers):
    1. Complete Business Verification for the portfolio.
    2. Submit `instagram_manage_comments`, `instagram_manage_messages`, `instagram_basic`, `pages_read_engagement`, `pages_show_list` and `pages_manage_metadata` for Advanced Access. For each: a short description and a screencast showing a test account commenting "@tigerworkoutsdotcom" under a reel, the reply with the link, the link opening the workout, and the DM path.
    3. Give reviewer steps (which account to comment from; the bot replies within a minute).
    4. Switch the app to **Live**.

## Open questions

- **Not checked against the live API** (the account does not exist yet), and the docs leave these open:
  - whether `permalink` and `username` come back inside `mentioned_comment{media{…}}`;
  - whether an `ig_reel` DM carries `reel_video_id`/`title`, and whether `GET /<media-id>` works on someone else's reel (otherwise a shared reel is answered "couldn't open that post, comment @tigerworkoutsdotcom under it instead");
  - whether a private reply to a comment on someone else's reel is allowed (the fallback when the comment reply fails);
  - whether the signature uses the Meta App Secret or the Instagram app secret under Instagram Login.
  - The first real payloads are logged in full (`{"ig":"job",…}`); check them on the first test.
- Links in Instagram comments are plain text, not tappable (not stated in Meta's docs). Should the comment reply also say "or DM us the reel for a tappable link"?
- The commenter's username is not in the Facebook Login mention payload, so the per-person limit counts per reel there.
- The credit uses the handle as the creator's name (the API gives no display name). Nick can set `author` with `update_workout` source before approving.
- Should the bot also take TikTok or YouTube links sent by DM? Not asked; today it reads only Instagram shares.
- Supabase refresh tokens are single-use. Two refreshes from different Cloudflare locations within seconds could end the bot's session. If the logs say "bot session ended", sign in again at /bot/connect.

Status: built

# Creator imports: influencers' workouts under their name

## Nick's asks (7 Nov 2026)

- He sends Instagram reels / social posts of influencers' workouts to his Claude app, connected to the TigerWorkouts MCP (`mcp/`), and wants them in the app under the influencer's name, so he and everyone else can find them.
- Visibility: "Everyone (catalogue)".
- Import: "I, as admin, find and import them with my own claude app and add them to the app".
- How it differs from an account (agreed): an influencer page has no login behind it. It lists workouts *adapted from* the creator's posts, each credited "Adapted from @handle · original post ↗". The influencer never posts or edits. It must never look like they published it themselves or are affiliated.
- The page shows the name, @handle linking to their profile on the platform, the line "Workouts adapted from their posts. Not affiliated with TigerWorkouts." and the workout cards.
- Discover/search finds them by creator name or handle; a creator name on a workout links to the page. Imports do not show on Nick's own account page (`#/c/`).

## As built

- **Admins**: `ADMIN_USER_IDS` in `mcp/wrangler.jsonc` (Nick's user id). Empty = nobody; an anonymous connection never is one (`isAdmin` in `mcp/src/access.ts`).
- **MCP**: `create_workout` and `update_workout` take `source` {url (https), author, handle, platform (instagram, tiktok, youtube, x, facebook, threads, other), title?}. Anyone not an admin gets "Only TigerWorkouts admins can import…" and nothing is written. With `source` the workout's creator is the author, it is public unless `public: false`, it is not sent from the AI coach (`update_workout` with source takes back an earlier AI coach send; `assign` on a credited workout is refused), and later edits keep the credit. `update_workout` `public: false` unpublishes. The tool descriptions tell the assistant: description in its own words, never the caption, link the original.
- **Storage**: no migration. The credit is the runsheet's `source` in `workouts.data` (jsonb): `kind: "social"`, plus `handle` and `platform` (new optional fields on `Source` in `src/features/runsheet/model.ts`). The row is owned by the admin who imported it.
- **Web**: credited creator pages at `#/by/<key>` (`src/features/creators/credited.ts`, `credited-creator-screen.tsx`), a route apart from accounts' `#/c/<handle>` so neither can take the other's name. A page groups the catalogue's authors in `imports/` (by `source.author`/`creator`) and public adapted workouts (by handle). Cards and Discover rows read "Adapted from @handle"; the workout page reads "Adapted from @handle · original post ↗", the handle opening the creator page; a catalogue workout's author opens its page too. A search lists matching creators above the workouts. `fetchCreator` leaves adapted workouts off the importing account's page.
- **iOS**: not built. The app decodes `source` leniently (`kind` is a String; unknown keys are ignored), so imports show there as ordinary public workouts credited to the creator's name, without the "Adapted from" line or a creator page.
- **Instagram bot**: imports also arrive from Instagram itself, pending until an admin approves them. See instagram-bot.md.

## Open questions

- Should the same creator in the catalogue and on a platform (e.g. Caroline Girvan's YouTube videos in `imports/` and an Instagram import as @carolinegirvan) share one page? Today they are two pages: the catalogue groups by name, imports by handle.
- Should an admin's imports also show in the admin's own Mine list? Today they do, as any workout the account owns.
- iOS: an "Adapted from" line and a creator page.

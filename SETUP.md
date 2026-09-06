# tigerworkouts.com — go-live checklist

Paste the block below into Claude in the browser. Everything else (repo, CNAME file, app,
icons, manifest) is already done.

---

You are setting up the domain **tigerworkouts.com** for a static app. Do these steps in order,
in my logged-in browser, and tell me what you see at each verification point.

**Facts**
- Domain: tigerworkouts.com, registered and hosted on Cloudflare (my account).
- App repo: https://github.com/Holzherr/tigerworkouts (public). Branch `main`, site root `/`.
  It already contains a `CNAME` file with `tigerworkouts.com` and a `.nojekyll` file.
- Hosting pattern: GitHub Pages behind the Cloudflare proxy (same as by9am.com).
- Supabase project: `icpdzjohsvlpyaluxgbt` (dashboard at supabase.com).

**1. GitHub Pages**
1. Open https://github.com/Holzherr/tigerworkouts/settings/pages
2. Build and deployment → Source: "Deploy from a branch". Branch: `main`, folder: `/ (root)`. Save.
3. Custom domain: it should show `tigerworkouts.com` (read from the CNAME file). If empty,
   type `tigerworkouts.com` and Save.
4. Leave "Enforce HTTPS" unticked for now. Come back to it in step 3.
   Verify: https://holzherr.github.io/tigerworkouts/ redirects to tigerworkouts.com (may 404 until DNS is live, fine).

**2. Cloudflare DNS**
1. Open https://dash.cloudflare.com → tigerworkouts.com → DNS → Records.
2. Delete any existing A, AAAA or CNAME records on `@` (root) and `www` (registrar parking records).
3. Add: Type `CNAME`, Name `@`, Target `holzherr.github.io`, Proxy status **Proxied** (orange cloud), TTL Auto.
4. Add: Type `CNAME`, Name `www`, Target `holzherr.github.io`, Proxied.
5. SSL/TLS → Overview → encryption mode **Full** (not Flexible, not Full (strict)).
6. SSL/TLS → Edge Certificates → "Always Use HTTPS" **On**.
   Verify: within ~5 minutes https://tigerworkouts.com loads a page titled "TigerWorkouts — v0.9.4"
   and https://www.tigerworkouts.com redirects to https://tigerworkouts.com.

**3. GitHub HTTPS (after DNS is live)**
1. Back on https://github.com/Holzherr/tigerworkouts/settings/pages, wait for "DNS check successful".
2. Tick "Enforce HTTPS". If the option stays greyed out for more than 30 minutes, leave it;
   Cloudflare already terminates TLS and that is acceptable.

**4. Supabase auth (so sign-in emails say TigerWorkouts and redirects allow the new domain)**
1. Open https://supabase.com/dashboard/project/icpdzjohsvlpyaluxgbt/auth/url-configuration
   - Site URL: `https://tigerworkouts.com/`
   - Redirect URLs: add `https://tigerworkouts.com/**` and `https://www.tigerworkouts.com/**`.
     Keep the existing entries. Save.
2. Open https://supabase.com/dashboard/project/icpdzjohsvlpyaluxgbt/settings/auth
   → SMTP Settings → Sender name: change `Workout Hub` to `TigerWorkouts`. Save.
3. Open https://supabase.com/dashboard/project/icpdzjohsvlpyaluxgbt/auth/templates
   For **Confirm signup**, **Magic Link** and **Change Email Address**:
   - Subject: `Your TigerWorkouts code: {{ .Token }}`
   - Body: replace every `Workout Hub` with `TigerWorkouts`. Do not touch `{{ .Token }}`. Save each.

**5. Final verification**
- https://tigerworkouts.com/manifest.webmanifest returns JSON with `"name": "TigerWorkouts"`.
- https://tigerworkouts.com/icons/icon-512.png shows the tiger on orange/white stripes.
- On the site, Profile → sign in with my email: the code email arrives from "TigerWorkouts".

Report back: which steps completed, any step that failed and the exact message shown.

---

## Notes for later (not for the browser)

- The old install at holzherr.github.io/nick-prototypes/workout-hub/ keeps working. Phones must
  re-add the app from tigerworkouts.com to get the new domain and icon; sessions and workouts are
  in Supabase, so sign in on the new domain and they come back.
- Once the new domain is confirmed, replace `nick-prototypes/workout-hub/index.html` with a
  redirect to https://tigerworkouts.com/ (keep `sw.js` so cached installs update).
- Workout logs still open issues on `Holzherr/nick-prototypes` (`GH_REPO` in index.html).

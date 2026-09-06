# Rebrand: Workout Hub → TigerWorkouts

Decided 6 Sep 2026. Mark = the reference tiger head, traced, heavy stroke + big eyes (V6).
Colour = coral `#ff4d2e` on white and black. App icon = black mark on two centred coral bands.
Source of truth for the mark: `src/shared/brand/tiger-mark-path.ts`; tile geometry:
`src/shared/brand/app-icon.tsx`; tokens: `src/styles/tailwind.css` + `DESIGN.md`.

## Done (this commit)

- **workout-hub-next**: brand bricks `TigerMark`, `AppIcon`, `Logo` + `Brand/*` stories
  (Mark, AppIcon, Logo, Palette). Tokens swapped to coral. `favicon.svg`, `icons/` PNGs
  (192 / 512 / 180 apple-touch / 1024 master / 64 favicon), `manifest.webmanifest`, page title,
  theme-colour, apple-touch link. README and DESIGN.md renamed.
- **workout-hub (v0.9.4)**: title, apple-mobile-web-app-title, theme-colour, `--brand` /
  `--brand-dark`, manifest (name, short_name "Tiger", white splash, coral theme), all four
  icons regenerated, invite copy, share title, service-worker cache bumped so phones pick up
  the new shell. localStorage keys (`workout-hub:*`) untouched so nobody loses data.
- **prototypes index**: link label.

## Next: product surfaces (in order)

1. **Header lockup in the app.** Put `<Logo size="sm" />` in the Discover header of
   workout-hub-next once that screen ports; v0.9 header stays text-only ("Ready to move?").
2. **Sign-in / empty states.** `<Logo size="lg" />` on the sign-in card and the first-run
   Discover empty state. Tab-bar avatar fallback = `<AppIcon size={24} tone="ink" />`.
3. **Supabase auth emails.** Sender name is "Workout Hub" (custom SMTP, Gmail app password in
   `~/.workout-hub-smtp`). Change the sender display name to "TigerWorkouts" in
   Supabase → Auth → SMTP settings and retitle the confirmation + magic-link templates
   ("Your TigerWorkouts code"). No code change.
4. **Domain: tigerworkouts.com.** Same pattern as by9am.com and nickholzherr.com: buy on
   Cloudflare, GitHub Pages custom domain on a dedicated repo (`Holzherr/tigerworkouts`),
   Cloudflare proxy, `CNAME` file in the repo. Move `workout-hub-next` out of nick-prototypes
   into that repo when it reaches parity so the Vite `base` becomes `/`. Until then keep the
   GitHub Pages paths. Update Supabase `site_url` + redirect allow-list when the domain goes live.
5. **iOS shell** (`Holzherr/workout-hub-app`, parked): rename appId `com.holzherr.workouthub`
   → `com.holzherr.tigerworkouts`, display name "TigerWorkouts", drop `icons/icon-1024.png`
   into the asset catalog. Only when native is picked back up.
6. **Supabase project name** "Holzherr's Project" → "TigerWorkouts" (cosmetic, dashboard only).
7. **Echo / assistant side.** `[workout-log]` GitHub-issue title prefix, the health-store
   `exercise` stream and `me/.workout-hub-supabase` keep their names; only user-facing copy in
   the Telegram health bot should say TigerWorkouts. Memory files updated to point here.

## Rules

- Mark is one colour, always. Stripes go behind it, never through it.
- One coral fill per screen (the primary action). Coral text uses `brand-ink` on white.
- Never rename storage keys, table names or the `workout-hub` URL path without a migration.

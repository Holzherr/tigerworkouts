-- Creator pages: each account gets a public page at tigerworkouts.com/#/c/<handle> listing the
-- workouts it made public. Workouts are private until their creator flips them (web sync wrote
-- public = true for every workout until 2026-09-26; those rows keep their flag).
alter table public.profiles
  add column if not exists handle text unique check (handle is null or handle ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  add column if not exists bio text check (bio is null or length(bio) <= 400);

alter table public.workouts alter column public set default false;

-- Visitors without an account read profiles and public workouts; RLS already limits workouts to
-- public ones (or your own), and profiles hold nothing private.
grant select on public.profiles to anon;
grant select on public.workouts to anon;

-- The public (anon) key reads nothing private. Two holes from the code review of 27 Sep 2026:
--
-- 1. The three exercise views in 0003 ran as their owner, so they skipped row-level security,
--    and 0003 granted them to anon: anyone with the key could list every private workout's id,
--    owner and exercise keys, and the name of every private user-added exercise. They now run as
--    the caller (security_invoker), so a signed-in user sees public workouts and their own, and
--    anon does not read them at all.
-- 2. Every profile was readable by anyone (0001's `using (true)`, granted to anon in 0005), and
--    a new profile's name defaulted to the local part of the email address, so the key listed
--    every user's id and email prefix. Other users and anon now read only profiles with a handle,
--    which is what a creator page needs (own row still comes through "profiles: own"); a new
--    profile's name is the provider's, or null; and the stored email prefixes are cleared.
--
-- Contains `revoke`, so deploy-watch holds this one for Nick to apply by hand.

alter view public.workout_exercise_refs set (security_invoker = true);
alter view public.exercise_usage set (security_invoker = true);
alter view public.exercise_demand set (security_invoker = true);
revoke select on public.workout_exercise_refs, public.exercise_usage, public.exercise_demand from anon;

alter policy "profiles: creators visible" on public.profiles using (handle is not null);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, new.raw_user_meta_data->>'name') on conflict do nothing;
  insert into public.user_state (owner) values (new.id) on conflict do nothing;
  return new;
end $$;

update public.profiles p set name = null
from auth.users u
where u.id = p.id and p.name = split_part(u.email, '@', 1);

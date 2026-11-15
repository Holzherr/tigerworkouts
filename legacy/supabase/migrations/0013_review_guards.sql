-- Guards from the 15 Nov 2026 data review. NOT additive (revoke, drop trigger, new constraints):
-- apply by hand, after the checks named in each section.

-- A. Credited imports. "Adapted from @handle" pages are built from any public workout whose
-- data.source.kind is 'social'. Only the MCP worker checked that the writer is an admin; the
-- database let any signed-up account write such a row and appear on a creator's page.
create table if not exists public.admins (id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security; -- no policies: the API roles read nothing
revoke all on public.admins from anon, authenticated;
-- The import account, as in mcp/wrangler.jsonc ADMIN_USER_IDS. Add others here.
insert into public.admins (id) select id from auth.users where id = '71ee1910-ef0a-471d-81bb-345ce7b9c2e3' on conflict do nothing;

create or replace function public.guard_workout_credit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.public and new.data->'source'->>'kind' = 'social' and auth.uid() is not null
     and not exists (select 1 from public.admins a where a.id = auth.uid()) then
    raise exception 'only admins publish credited imports';
  end if;
  return new;
end $$;
drop trigger if exists workouts_credit_guard on public.workouts;
create trigger workouts_credit_guard before insert or update on public.workouts
  for each row execute function public.guard_workout_credit();

-- C. Size limits. Nothing bounded a jsonb or text column, and every client downloads every public
-- workout's data. Run first:
--   select max(octet_length(data::text)) from public.workouts;   (and sessions, exercises, user_state)
-- NOT VALID leaves existing rows alone; new and changed rows are checked.
alter table public.workouts   add constraint workouts_data_size  check (octet_length(data::text) <= 262144) not valid;
alter table public.sessions   add constraint sessions_data_size  check (octet_length(data::text) <= 262144) not valid;
alter table public.exercises  add constraint exercises_data_size check (octet_length(data::text) <= 32768) not valid;
alter table public.user_state add constraint user_state_size     check (octet_length(favorites::text) <= 65536 and octet_length(prefs::text) <= 1048576) not valid;
alter table public.workouts   add constraint workouts_text_len   check (length(id) <= 80 and coalesce(length(title), 0) <= 200 and coalesce(length(creator), 0) <= 80) not valid;
alter table public.sessions   add constraint sessions_text_len   check (length(id) <= 200 and coalesce(length(title), 0) <= 200 and coalesce(length(workout_id), 0) <= 120 and length(type) <= 40) not valid;
alter table public.exercises  add constraint exercises_key_len   check (length(key) <= 120) not valid;
alter table public.profiles   add constraint profiles_name_len   check (name is null or length(name) <= 80) not valid;

-- D. A temporary (anonymous) account holds no creator handle: 0009 kept its workouts private but
-- left the handle, so it could take a name and a public page for seven days.
create or replace function public.keep_anonymous_handleless() returns trigger language plpgsql as $$
begin
  if public.is_anonymous_caller() then new.handle := null; new.bio := null; end if;
  return new;
end $$;
drop trigger if exists profiles_anonymous_handleless on public.profiles;
create trigger profiles_anonymous_handleless before insert or update on public.profiles
  for each row execute function public.keep_anonymous_handleless();

-- F. Functions meant for signed-in callers only. Postgres grants execute to PUBLIC by default.
revoke execute on function public.accept_coach_invite(text) from public, anon;
grant  execute on function public.accept_coach_invite(text) to authenticated;
revoke execute on function public.session_device(timestamptz, timestamptz) from public, anon;
grant  execute on function public.session_device(timestamptz, timestamptz) to authenticated;

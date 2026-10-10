-- Anonymous accounts ("Start now" in the MCP connector) can't publish, and are deleted after 7 days
-- unless claimed. Supabase flips auth.users.is_anonymous to false once an email is added and
-- confirmed, so a claimed account is never touched.

-- Read from the caller's JWT: anonymous sign-ins carry "is_anonymous": true.
create or replace function public.is_anonymous_caller() returns boolean
language sql stable as $$ select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

-- Anything an anonymous caller writes stays private, so nothing shows in Discover or on creator
-- pages until the account is claimed. Coerced rather than refused, so the apps' sync (which sends
-- exercises as public) keeps working for them.
create or replace function public.keep_anonymous_private() returns trigger language plpgsql as $$
begin
  if public.is_anonymous_caller() then new.public := false; end if;
  return new;
end $$;

drop trigger if exists workouts_anonymous_private on public.workouts;
create trigger workouts_anonymous_private before insert or update on public.workouts
  for each row execute function public.keep_anonymous_private();

drop trigger if exists exercises_anonymous_private on public.exercises;
create trigger exercises_anonymous_private before insert or update on public.exercises
  for each row execute function public.keep_anonymous_private();

-- Unclaimed anonymous accounts older than 7 days go, with everything they own (every table's owner
-- column cascades on delete).
create or replace function public.delete_abandoned_anonymous_users() returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  delete from auth.users where is_anonymous and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.delete_abandoned_anonymous_users() from public, anon, authenticated;

-- Daily at 03:17 UTC. Skipped where pg_cron isn't available (the local RLS harness).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'delete-abandoned-anonymous-users') then
      perform cron.unschedule('delete-abandoned-anonymous-users');
    end if;
    perform cron.schedule('delete-abandoned-anonymous-users', '17 3 * * *',
                          'select public.delete_abandoned_anonymous_users()');
  end if;
end $$;

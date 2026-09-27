-- Account deletion, needed before the App Store (guideline 5.1.1(v)): a signed-in user can delete
-- their account and everything the server holds for it from inside either app.
--
-- The apps first delete the rows they can under row-level security (sessions, workouts,
-- exercises, user_state, device_metrics), then call this function, which removes the sign-in
-- itself. Every table references auth.users with `on delete cascade`, so this also takes anything
-- the first pass missed, and the profile. `security definer` runs it as the owner (postgres), the
-- only role that may delete from auth.users; `auth.uid()` limits it to the caller's own account.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from public.sessions where owner = me;
  delete from public.workouts where owner = me;
  delete from public.exercises where owner = me;
  delete from public.user_state where owner = me;
  delete from public.device_metrics where owner = me;
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

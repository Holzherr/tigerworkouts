-- Two holes in 0008's coaching policies, found by the RLS harness (tests/0010_coaching_checks_rls.sql).
-- Contains `revoke`, so Nick applies it by hand.

-- 1. An assignment could be re-pointed at anyone's workout: the update check left out the "workout
--    the coach owns" rule the insert has, and "workouts: assigned to me" then let the client read it.
alter policy "assignments: coach updates" on public.assignments
  with check (coach = auth.uid() and public.is_coach_of(coach, client)
              and exists (select 1 from public.workouts w where w.id = workout_id and w.owner = auth.uid()));

-- 2. is_coach_of is security definer and answered for any pair, so anyone could probe who coaches
--    whom. Every policy passes auth.uid() as one side, so it now answers only for the caller.
create or replace function public.is_coach_of(p_coach uuid, p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (p_coach, p_client)
     and exists (select 1 from public.coach_clients where coach = p_coach and client = p_client and status = 'active')
$$;
revoke execute on function public.is_coach_of(uuid, uuid) from public, anon;
grant execute on function public.is_coach_of(uuid, uuid) to authenticated;

-- 3. Ending a link could also rewrite who it names: either side may change only its status.
revoke update on public.coach_clients from authenticated;
grant update (status) on public.coach_clients to authenticated;

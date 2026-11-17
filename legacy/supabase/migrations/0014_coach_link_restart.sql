-- Review round 2, A8 (Nick, 2026-11-17): a client cannot restart a coaching link the coach ended.
-- 0008's accept_coach_invite let whoever first used a code use it again at any time, and its
-- "on conflict ... set status = active" then brought an ended link back. Now a used code works only
-- while its link is still active (accepting again is a no-op); once either side has ended it, only
-- a new invite from the coach starts it again. Additive (create or replace), so deploy-watch applies it.

create or replace function public.accept_coach_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_coach uuid; v_taken uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select coach, accepted_by into v_coach, v_taken from public.coach_invites where code = p_code for update;
  if v_coach is null then raise exception 'invite not found'; end if;
  if v_coach = auth.uid() then raise exception 'this is your own invite'; end if;
  if v_taken is not null and v_taken <> auth.uid() then raise exception 'invite already used'; end if;
  if v_taken is not null then
    -- The caller's own used code: fine while the link it made is active, refused once it was ended.
    if not exists (select 1 from public.coach_clients where coach = v_coach and client = auth.uid() and status = 'active') then
      raise exception 'coaching ended: ask for a new invite';
    end if;
    return jsonb_build_object('coach', v_coach);
  end if;
  update public.coach_invites set accepted_by = auth.uid(), accepted_at = now() where code = p_code;
  -- A new invite restarts a link that was ended before.
  insert into public.coach_clients (coach, client) values (v_coach, auth.uid())
    on conflict (coach, client) do update set status = 'active';
  return jsonb_build_object('coach', v_coach);
end $$;
-- create or replace keeps 0013's grants (authenticated only).

-- Share by link (review round 2, U4; Nick, 17 Nov 2026): a private workout is shared by its short
-- link, tigerworkouts.com/#/w/<id>, and opens for anyone who has the link, with the full preview and
-- Start, without being listed in Discover or on the owner's public page.
--
-- Share sets `unlisted: true` inside the stored workout (`data`), so the apps' sync needs no new
-- column and keeps working whether or not this has run. Reading by link goes through
-- shared_workout(id) only: a policy on the table would let `select *` list every unlisted workout.
-- Additive only (no drop, delete or revoke).

-- One workout by id, for a link: public, shared by link, assigned to the caller by an active coach,
-- or the caller's own. Signed-out visitors may ask too (a link is for anyone).
create or replace function public.shared_workout(p_id text)
returns table (id text, owner uuid, creator text, title text, public boolean, data jsonb)
language sql stable security definer set search_path = public as $$
  select w.id, w.owner, w.creator, w.title, w.public, w.data
  from public.workouts w
  where w.id = p_id
    and (w.public
         or w.data->'unlisted' = 'true'::jsonb
         or w.owner = auth.uid()
         or exists (select 1 from public.assignments a
                    where a.workout_id = w.id and a.client = auth.uid() and public.is_coach_of(a.coach, a.client)))
$$;
grant execute on function public.shared_workout(text) to anon, authenticated;

-- A temporary (anonymous) account cannot share by link, as it cannot publish (0009).
create or replace function public.keep_anonymous_unlisted_off() returns trigger language plpgsql as $$
begin
  if public.is_anonymous_caller() and new.data ? 'unlisted' then new.data := new.data - 'unlisted'; end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'workouts_anonymous_unlisted' and tgrelid = 'public.workouts'::regclass) then
    create trigger workouts_anonymous_unlisted before insert or update on public.workouts
      for each row execute function public.keep_anonymous_unlisted_off();
  end if;
end $$;

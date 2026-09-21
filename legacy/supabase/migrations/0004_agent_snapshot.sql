-- Aggregates for the nightly report. The agent-team runner (runner/snapshot.mjs) connects as
-- `agent_reader` and runs `select public.agent_snapshot(8)`. Sessions are owner-only under RLS,
-- so the function is security definer and returns counts, medians, uuids and workout titles only:
-- never a session's data blob, never free text from it. Applied by hand, like the others.

create or replace function public.agent_snapshot(days int)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with s as (
    select owner, workout_id, title, started_at, duration_min, completed,
           -- The web app writes startedFrom at the top of `data` (v2 rows) or under `data.v2`
           -- when the row began life in v0.9. Rows without one are counted as "none".
           coalesce(data->>'startedFrom', data->'v2'->>'startedFrom', 'none') as origin
    from public.sessions
    where started_at >= now() - days * interval '1 day'
  )
  select jsonb_build_object(
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', day, 'sessions', sessions, 'completed', completed, 'median_min', median_min)
               order by day), '[]'::jsonb)
      from (
        select started_at::date as day,
               count(*) as sessions,
               count(*) filter (where completed) as completed,
               percentile_cont(0.5) within group (order by duration_min) as median_min
        from s group by 1
      ) d),
    'origins', (
      select coalesce(jsonb_object_agg(owner, by_origin), '{}'::jsonb)
      from (
        select owner, jsonb_object_agg(origin, n) as by_origin
        from (select owner, origin, count(*) as n from s group by 1, 2) o
        group by owner
      ) p),
    'workouts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'workout_id', workout_id, 'title', title, 'sessions', sessions)
               order by sessions desc, workout_id), '[]'::jsonb)
      from (
        select workout_id, min(title) as title, count(*) as sessions
        from s where workout_id is not null
        group by workout_id order by sessions desc, workout_id limit 10
      ) w),
    'owners', (select coalesce(jsonb_agg(distinct owner), '[]'::jsonb) from s)
  )
$$;

-- Login role for the runner. No password here: Nick sets one when he applies this
-- (`alter role agent_reader password '…'`). It can execute this one function and nothing else.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_reader') then
    create role agent_reader login nosuperuser noinherit nocreatedb nocreaterole;
  end if;
end $$;

grant usage on schema public to agent_reader;
revoke execute on function public.agent_snapshot(int) from public, anon, authenticated;
grant execute on function public.agent_snapshot(int) to agent_reader;

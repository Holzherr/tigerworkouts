-- AI coach (Nick, 19 Oct 2026): "Anything claude makes should use the PT/coach feature we have - and
-- the coach should be logged as AI coach ... the AI should use the coach feature like a PT would but as AI."
--
-- ai_coaches   one row per person who has an AI coach: the name it goes by (the person's choice,
--              default "AI Coach") and whether it is on. The person reads, renames and removes it.
-- assignments  an AI coach's assignment is a row with coach = client = the person: the AI has no
--              account of its own, so it acts as the person, through the MCP connector, on a workout
--              the person owns. A PT's row can never look like this (coach_clients forbids coach =
--              client, and a PT may only assign to a linked client), so coach = client is the marker.
--
-- Contains `revoke`, so deploy-watch holds it for Nick to apply by hand.

create table if not exists public.ai_coaches (
  client uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'AI Coach' check (length(btrim(name)) between 1 and 40),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'touch_ai_coaches' and tgrelid = 'public.ai_coaches'::regclass) then
    create trigger touch_ai_coaches before update on public.ai_coaches for each row execute function public.touch_updated_at();
  end if;
end $$;

alter table public.ai_coaches enable row level security;
create policy "ai_coaches: own reads" on public.ai_coaches for select using (client = auth.uid());
create policy "ai_coaches: own adds" on public.ai_coaches for insert with check (client = auth.uid());
create policy "ai_coaches: own changes" on public.ai_coaches for update using (client = auth.uid()) with check (client = auth.uid());

grant select, insert on public.ai_coaches to authenticated;
-- Rename or turn on/off; never re-point the row at someone else.
revoke update on public.ai_coaches from authenticated;
grant update (name, status) on public.ai_coaches to authenticated;

-- The AI coach assigns the person one of their own workouts while it is on. Reading and removing
-- those rows is already covered: "assignments: coach reads own" and "assignments: coach removes"
-- match coach = auth.uid().
create policy "assignments: AI coach writes" on public.assignments for insert
  with check (coach = auth.uid() and client = auth.uid()
              and exists (select 1 from public.ai_coaches c where c.client = auth.uid() and c.status = 'active')
              and exists (select 1 from public.workouts w where w.id = workout_id and w.owner = auth.uid()));

-- agent_snapshot: G-13's pt_client_runs counts PTs only (coach <> client); the AI coach gets its own
-- counts. Everything else is 0008's body unchanged.
create or replace function public.agent_snapshot(days int)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with s as (
    select owner, workout_id, title, started_at, duration_min, completed,
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
    'owners', (select coalesce(jsonb_agg(distinct owner), '[]'::jsonb) from s),
    'pt_client_runs', (
      select count(*) from s
      where exists (select 1 from public.assignments a where a.client = s.owner and a.workout_id = s.workout_id and a.coach <> a.client)),
    'pt_links', (select count(*) from public.coach_clients where status = 'active'),
    'pt_assignments', (select count(*) from public.assignments where coach <> client and created_at >= now() - days * interval '1 day'),
    'ai_coach_runs', (
      select count(*) from s
      where exists (select 1 from public.assignments a where a.client = s.owner and a.workout_id = s.workout_id and a.coach = a.client)),
    'ai_coaches', (select count(*) from public.ai_coaches where status = 'active'),
    'ai_assignments', (select count(*) from public.assignments where coach = client and created_at >= now() - days * interval '1 day')
  )
$$;

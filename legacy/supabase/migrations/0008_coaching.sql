-- Coaching (G-13): a PT invites clients, assigns them workouts, sees what they did and leaves notes.
--
-- coach_invites   one row per invite link; the code is the secret in tigerworkouts.com/#/join/<code>
-- coach_clients   the PT ↔ client link, made only by accept_coach_invite(); either side can end it
-- assignments     a workout a PT sent one client, with an optional note
-- coach_notes     short notes on a client's session or assignment, written by either side
--
-- Accepting an invite is consent: while the link is active the PT reads the client's sessions and
-- the workouts assigned to them, and both read each other's profile. Ending the link stops all of it.
-- Additive only (no drop, delete or revoke), so deploy-watch applies it unattended once 0006/0007 are in.

create table if not exists public.coach_invites (
  code text primary key default replace(gen_random_uuid()::text, '-', ''),
  coach uuid not null references auth.users(id) on delete cascade,
  label text check (label is null or length(label) <= 80),
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);
create index if not exists coach_invites_coach on public.coach_invites(coach);

create table if not exists public.coach_clients (
  coach uuid not null references auth.users(id) on delete cascade,
  client uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach, client),
  check (coach <> client)
);
create index if not exists coach_clients_client on public.coach_clients(client);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  coach uuid not null references auth.users(id) on delete cascade,
  client uuid not null references auth.users(id) on delete cascade,
  workout_id text not null references public.workouts(id) on delete cascade,
  note text check (note is null or length(note) <= 1000),
  due_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assignments_client on public.assignments(client, created_at desc);
create index if not exists assignments_coach on public.assignments(coach, client);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach uuid not null references auth.users(id) on delete cascade,
  client uuid not null references auth.users(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  session_id text,
  assignment_id uuid references public.assignments(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists coach_notes_pair on public.coach_notes(coach, client, created_at desc);

do $$ declare t text;
begin
  foreach t in array array['coach_clients', 'assignments'] loop
    -- create-if-missing rather than drop-and-create: deploy-watch holds any script that drops something.
    if not exists (select 1 from pg_trigger where tgname = 'touch_' || t and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
    end if;
  end loop;
end $$;

-- Is there an active link between this PT and this client? Security definer so policies on other
-- tables can ask without recursing through coach_clients' own RLS.
create or replace function public.is_coach_of(p_coach uuid, p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_clients where coach = p_coach and client = p_client and status = 'active')
$$;

alter table public.coach_invites enable row level security;
alter table public.coach_clients enable row level security;
alter table public.assignments enable row level security;
alter table public.coach_notes enable row level security;

-- Invites: the PT manages their own. A client never reads the table; they go through the RPCs.
create policy "coach_invites: own" on public.coach_invites for all
  using (coach = auth.uid()) with check (coach = auth.uid() and accepted_by is null);

-- Links: both sides read; either side may end it (status → ended). Created only by accept_coach_invite().
create policy "coach_clients: either side reads" on public.coach_clients for select
  using (coach = auth.uid() or client = auth.uid());
create policy "coach_clients: either side ends" on public.coach_clients for update
  using (coach = auth.uid() or client = auth.uid())
  with check ((coach = auth.uid() or client = auth.uid()) and status = 'ended');

-- Assignments: the PT writes them for an active client and only with a workout they own; the client reads theirs.
create policy "assignments: coach reads own" on public.assignments for select using (coach = auth.uid());
create policy "assignments: client reads own" on public.assignments for select
  using (client = auth.uid() and public.is_coach_of(coach, client));
create policy "assignments: coach writes" on public.assignments for insert
  with check (coach = auth.uid() and public.is_coach_of(coach, client)
              and exists (select 1 from public.workouts w where w.id = workout_id and w.owner = auth.uid()));
create policy "assignments: coach updates" on public.assignments for update
  using (coach = auth.uid()) with check (coach = auth.uid() and public.is_coach_of(coach, client));
create policy "assignments: coach removes" on public.assignments for delete using (coach = auth.uid());

-- Notes: both sides of an active link read and write; nobody edits a note after the fact.
create policy "coach_notes: pair reads" on public.coach_notes for select
  using ((coach = auth.uid() or client = auth.uid()) and public.is_coach_of(coach, client));
create policy "coach_notes: pair writes" on public.coach_notes for insert
  with check (author = auth.uid() and (coach = auth.uid() or client = auth.uid()) and public.is_coach_of(coach, client));

-- What the link opens on existing tables. Signed-in callers only: anon reads workouts and profiles
-- (Discover, creator pages) but holds no grant on assignments, and a policy that reads a table the
-- caller cannot read fails the whole query ("permission denied for table assignments").
create policy "workouts: assigned to me" on public.workouts for select to authenticated
  using (exists (select 1 from public.assignments a
                 where a.workout_id = workouts.id and a.client = auth.uid() and public.is_coach_of(a.coach, a.client)));
create policy "sessions: my coach reads" on public.sessions for select to authenticated
  using (public.is_coach_of(auth.uid(), owner));
create policy "profiles: my coach or client" on public.profiles for select to authenticated
  using (public.is_coach_of(auth.uid(), id) or public.is_coach_of(id, auth.uid()));

-- What a not-yet-accepted invite shows: the PT's name, nothing else.
create or replace function public.coach_invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('coach', i.coach, 'name', coalesce(p.name, 'Your coach'), 'handle', p.handle,
                            'accepted', i.accepted_by is not null)
  from public.coach_invites i left join public.profiles p on p.id = i.coach
  where i.code = p_code
$$;

-- Accept: links the caller to the PT. An invite is single-use; accepting your own is refused; a link
-- that was ended comes back to active.
create or replace function public.accept_coach_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_coach uuid; v_taken uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select coach, accepted_by into v_coach, v_taken from public.coach_invites where code = p_code for update;
  if v_coach is null then raise exception 'invite not found'; end if;
  if v_coach = auth.uid() then raise exception 'this is your own invite'; end if;
  if v_taken is not null and v_taken <> auth.uid() then raise exception 'invite already used'; end if;
  update public.coach_invites set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now()) where code = p_code;
  insert into public.coach_clients (coach, client) values (v_coach, auth.uid())
    on conflict (coach, client) do update set status = 'active';
  return jsonb_build_object('coach', v_coach);
end $$;

grant execute on function public.coach_invite_info(text) to anon, authenticated;
grant execute on function public.accept_coach_invite(text) to authenticated;
grant execute on function public.is_coach_of(uuid, uuid) to authenticated;
grant select, insert, update on public.coach_invites, public.coach_clients, public.assignments, public.coach_notes to authenticated;
grant delete on public.coach_invites, public.assignments to authenticated;

-- agent_snapshot gains pt_client_runs: sessions in the window whose workout a PT had assigned to
-- that session's owner (G-13's metric). Everything else is 0004's body unchanged.
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
      where exists (select 1 from public.assignments a where a.client = s.owner and a.workout_id = s.workout_id)),
    'pt_links', (select count(*) from public.coach_clients where status = 'active'),
    'pt_assignments', (select count(*) from public.assignments where created_at >= now() - days * interval '1 day')
  )
$$;

-- Workout Hub — initial schema. Applied with `npx supabase db push` from workout-hub/.
-- Everything the phone keeps in localStorage has a home here; JSON payloads stay
-- in jsonb so the app's data model can evolve without migrations for every field.

create extension if not exists pgcrypto;

-- profiles: one per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  units text not null default 'metric' check (units in ('metric','imperial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- exercises: shared library. owner null = seed content maintained in the repo.
create table if not exists public.exercises (
  key text primary key,
  owner uuid references auth.users(id) on delete cascade,
  public boolean not null default true,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- workouts: creator content. public = shows in everyone's Discover.
create table if not exists public.workouts (
  id text primary key,
  owner uuid references auth.users(id) on delete cascade,
  creator text,
  title text,
  public boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- sessions: immutable-ish log events (the raw input for coaching rollups)
create table if not exists public.sessions (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  workout_id text,
  type text not null default 'workout',
  title text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_min int,
  completed boolean not null default true,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists sessions_owner_started on public.sessions(owner, started_at desc);

-- user_state: small per-user blobs (favourites, custom exercise keys, prefs)
create table if not exists public.user_state (
  owner uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- device_metrics: Fitbit / Google Health rows pushed by the VM sync job
create table if not exists public.device_metrics (
  id bigserial primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  source text not null default 'google-health',
  kind text not null check (kind in ('workout','sleep','day')),
  started_at timestamptz not null,
  ended_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (owner, source, kind, started_at)
);
create index if not exists device_metrics_owner_started on public.device_metrics(owner, started_at desc);

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text;
begin
  foreach t in array array['profiles','exercises','workouts','sessions','user_state','device_metrics'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s; create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- auto-create profile + user_state on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))) on conflict do nothing;
  insert into public.user_state (owner) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Row level security
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.sessions enable row level security;
alter table public.user_state enable row level security;
alter table public.device_metrics enable row level security;

create policy "profiles: own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: creators visible" on public.profiles for select using (true);

create policy "exercises: read public or own" on public.exercises for select using (public or owner = auth.uid());
create policy "exercises: write own" on public.exercises for insert with check (owner = auth.uid());
create policy "exercises: update own" on public.exercises for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "exercises: delete own" on public.exercises for delete using (owner = auth.uid());

create policy "workouts: read public or own" on public.workouts for select using (public or owner = auth.uid());
create policy "workouts: write own" on public.workouts for insert with check (owner = auth.uid());
create policy "workouts: update own" on public.workouts for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "workouts: delete own" on public.workouts for delete using (owner = auth.uid());

create policy "sessions: own" on public.sessions for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "user_state: own" on public.user_state for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "device_metrics: own" on public.device_metrics for all using (owner = auth.uid()) with check (owner = auth.uid());

-- device metrics overlapping a session (±30 min), used by the app to enrich a session
create or replace function public.session_device(p_started timestamptz, p_ended timestamptz)
returns setof public.device_metrics language sql stable security invoker as $$
  select * from public.device_metrics
  where owner = auth.uid() and kind = 'workout'
    and started_at between p_started - interval '30 minutes' and coalesce(p_ended, p_started) + interval '30 minutes'
  order by started_at
$$;

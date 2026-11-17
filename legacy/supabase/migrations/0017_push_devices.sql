-- Push notifications for coaching (review round 2, U3; Nick, 17 Nov 2026): a client is told of a new
-- workout or note from their coach by push notification.
--
-- push_devices   the iPhone app's APNs device tokens, one row per phone, owned by whoever signed in
--                on it last (register_push_device / unregister_push_device; no direct writes)
-- triggers       a PT's new assignment, and a note the PT writes, post the client's tokens to the
--                MCP worker (POST https://mcp.tigerworkouts.com/push/coaching), which signs for APNs
--
-- Off until both halves are set up, and never in the way of the coach's write:
--   * here: pg_net, and a Vault secret named push_hook_secret
--       select vault.create_secret('<long random string>', 'push_hook_secret');
--   * on the worker: the same string as the secret PUSH_HOOK_SECRET, plus the APNs key
--     (APNS_KEY_ID, APNS_PRIVATE_KEY; mcp/src/push.ts)
-- The AI coach (coach = client) sends no push: the person is in the chat that wrote it.
-- Additive only (no drop or revoke).

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

create table if not exists public.push_devices (
  token text primary key check (token ~ '^[0-9a-f]{32,200}$'),
  owner uuid not null references auth.users(id) on delete cascade,
  -- A debug build from Xcode gets a sandbox token; TestFlight and the App Store a production one.
  sandbox boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_owner on public.push_devices(owner);

alter table public.push_devices enable row level security;
create policy "push_devices: own reads" on public.push_devices for select using (owner = auth.uid());

-- The phone's token, now belonging to whoever is signed in on it.
create or replace function public.register_push_device(p_token text, p_sandbox boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_devices(token, owner, sandbox) values (lower(p_token), auth.uid(), coalesce(p_sandbox, false))
  on conflict (token) do update set owner = excluded.owner, sandbox = excluded.sandbox, updated_at = now();
end $$;

-- Signing out: this phone no longer hears about that account.
create or replace function public.unregister_push_device(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_devices where token = lower(p_token) and owner = auth.uid()
$$;

-- Tokens APNs said are dead (the app was deleted, or the phone reset). Called by the worker with
-- the hook's secret, as it holds no other key.
create or replace function public.forget_push_devices(p_secret text, p_tokens text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int; s text;
begin
  -- Read here, not through a function of its own: that one would hand the secret to any caller.
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into s using 'push_hook_secret';
  end if;
  if s is null or p_secret is distinct from s then raise exception 'denied'; end if;
  delete from public.push_devices where token = any(p_tokens);
  get diagnostics n = row_count;
  return n;
end $$;

-- A PT's new assignment or note → the worker, which sends the push. Fire and forget (pg_net is
-- asynchronous); anything that goes wrong here leaves the write as it was.
create or replace function public.push_coaching() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  secret text;
  devices jsonb;
  coach_name text;
  kind text;
  title text;
  body text;
  workout text;
begin
  if new.coach = new.client then return new; end if;
  if tg_table_name = 'coach_notes' then
    if new.author <> new.coach then return new; end if;
    kind := 'note';
    body := new.body;
  else
    kind := 'workout';
    body := new.note;
    workout := new.workout_id;
    select w.title into title from public.workouts w where w.id = new.workout_id;
  end if;
  if to_regnamespace('net') is null then return new; end if;
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'push_hook_secret';
  end if;
  if secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('token', d.token, 'sandbox', d.sandbox)) into devices
    from public.push_devices d where d.owner = new.client;
  if devices is null then return new; end if;
  select nullif(btrim(p.name), '') into coach_name from public.profiles p where p.id = new.coach;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)' using
    'https://mcp.tigerworkouts.com/push/coaching',
    jsonb_build_object('kind', kind, 'coach', coalesce(coach_name, 'Your coach'), 'title', title,
                       'body', left(body, 300), 'workoutId', workout, 'devices', devices),
    jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || secret);
  return new;
exception when others then
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'push_assignment' and tgrelid = 'public.assignments'::regclass) then
    create trigger push_assignment after insert on public.assignments for each row execute function public.push_coaching();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'push_coach_note' and tgrelid = 'public.coach_notes'::regclass) then
    create trigger push_coach_note after insert on public.coach_notes for each row execute function public.push_coaching();
  end if;
end $$;

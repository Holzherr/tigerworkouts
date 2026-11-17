create extension if not exists pgcrypto;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean not null default false, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

-- Assertions for the scenarios. Each returns a line starting "ok:" or "FAIL:"; run.sh fails on FAIL.
-- t.blocked and t.fails run the statement as the current role and always roll it back.
create schema t;
grant usage on schema t to anon, authenticated;
create function t.ok(cond boolean, label text) returns text language sql as $$
  select case when coalesce(cond, false) then 'ok: ' else 'FAIL: ' end || label $$;
-- Refused by the rules: a row-level-security or permission error, or (RLS on update/delete) no
-- row touched. Any other error is a FAIL, so a typo in the statement cannot pass as refused.
create function t.blocked(stmt text, label text) returns text language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    raise exception 'tw-rollback %', n;
  exception when others then
    if sqlerrm like 'tw-rollback %' then
      if split_part(sqlerrm, ' ', 2)::int = 0 then return 'ok: ' || label; end if;
      return 'FAIL: ' || label || ' (changed ' || split_part(sqlerrm, ' ', 2) || ' rows)';
    end if;
    if sqlerrm ~* 'row-level security|permission denied' then return 'ok: ' || label; end if;
    return 'FAIL: ' || label || ' (' || sqlerrm || ')';
  end;
end $$;
-- Refused with an error whose message matches pattern (case-insensitive regex).
create function t.fails(stmt text, pattern text, label text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
    raise exception 'tw-rollback';
  exception when others then
    if sqlerrm = 'tw-rollback' then return 'FAIL: ' || label || ' (no error)'; end if;
    if sqlerrm ~* pattern then return 'ok: ' || label; end if;
    return 'FAIL: ' || label || ' (' || sqlerrm || ')';
  end;
end $$;
grant execute on all functions in schema t to anon, authenticated;

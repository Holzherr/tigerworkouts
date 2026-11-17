\set ON_ERROR_STOP 0
\set VERBOSITY terse
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
insert into auth.users(id,email,is_anonymous) values
 ('00000000-0000-0000-0000-000000001401','owner@x',false),
 ('00000000-0000-0000-0000-000000001402','friend@x',false),
 ('00000000-0000-0000-0000-000000001403',null,true);
insert into public.workouts(id,owner,title,public,data) values
 ('w-link','00000000-0000-0000-0000-000000001401','By link',false,'{"items":[],"unlisted":true}'),
 ('w-closed','00000000-0000-0000-0000-000000001401','Private',false,'{"items":[]}'),
 ('w-odd','00000000-0000-0000-0000-000000001401','Odd flag',false,'{"items":[],"unlisted":"yes"}');
create function pg_temp.as_user(u text, anon boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'is_anonymous', anon)::text, false);
end $$;

-- a signed-out visitor opens the link, but cannot list it or open a private one
set role anon; select pg_temp.as_user('');
select case when count(*) = 1 then 'ok: anon opens a workout shared by link' else 'FAIL: anon cannot open the link' end from public.shared_workout('w-link');
select case when count(*) = 0 then 'ok: anon cannot open a private workout' else 'FAIL: anon opens a private workout' end from public.shared_workout('w-closed');
select case when count(*) = 0 then 'ok: only a true flag shares' else 'FAIL: a non-boolean flag shares' end from public.shared_workout('w-odd');
select case when count(*) = 0 then 'ok: unlisted is not listed' else 'FAIL: unlisted workouts are listed' end from public.workouts where id = 'w-link';
reset role;

-- a signed-in friend: the same
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001402');
select case when count(*) = 1 then 'ok: friend opens the link' else 'FAIL: friend cannot open the link' end from public.shared_workout('w-link');
select case when count(*) = 0 then 'ok: friend cannot list it' else 'FAIL: friend lists it' end from public.workouts where id = 'w-link';
select case when count(*) = 0 then 'ok: friend cannot open a private one' else 'FAIL: friend opens a private one' end from public.shared_workout('w-closed');
reset role;

-- the owner reads their own private one through it too
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001401');
select case when count(*) = 1 then 'ok: owner opens own private' else 'FAIL: owner cannot open own' end from public.shared_workout('w-closed');
reset role;

-- a temporary account cannot share by link
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001403', true);
insert into public.workouts(id,owner,title,public,data) values ('w-anon-link',auth.uid(),'Anon',false,'{"items":[],"unlisted":true}');
reset role;
select case when not (data ? 'unlisted') then 'ok: anonymous unlisted dropped' else 'FAIL: anonymous account shares by link' end from public.workouts where id = 'w-anon-link';

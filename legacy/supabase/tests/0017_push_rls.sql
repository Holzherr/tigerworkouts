\set ON_ERROR_STOP 0
\set VERBOSITY terse
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000001501','coach15@x','{"name":"Sam"}'),
 ('00000000-0000-0000-0000-000000001502','client15@x','{"name":"Ali"}');
insert into public.coach_clients(coach,client) values ('00000000-0000-0000-0000-000000001501','00000000-0000-0000-0000-000000001502');
insert into public.workouts(id,owner,title,data) values ('w-push','00000000-0000-0000-0000-000000001501','Strength A','{}');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
\set tok 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

-- signed out: no registering
set role anon; select pg_temp.as_user('');
select public.register_push_device(:'tok');
\echo ^ expected not signed in
reset role;

-- the client registers the phone; reads it; the coach cannot
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001502');
select public.register_push_device(upper(:'tok'), true);
select case when count(*) = 1 then 'ok: client sees own device' else 'FAIL: client device missing' end from public.push_devices;
insert into public.push_devices(token, owner) values (repeat('b', 64), auth.uid());
\echo ^ expected permission denied or RLS (writes go through the functions)
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001501');
select case when count(*) = 0 then 'ok: coach cannot read client devices' else 'FAIL: coach reads client devices' end from public.push_devices;
-- the coach's writes still go through with the push triggers in place (no pg_net, no Vault here)
insert into public.assignments(coach,client,workout_id,note) values (auth.uid(),'00000000-0000-0000-0000-000000001502','w-push','Go');
insert into public.coach_notes(coach,client,author,body) values (auth.uid(),'00000000-0000-0000-0000-000000001502',auth.uid(),'Nice work 15');
select public.forget_push_devices('guess', array[:'tok']);
\echo ^ expected denied
reset role;
select case when count(*) = 1 then 'ok: assignment written' else 'FAIL: push trigger stopped the assignment' end from public.assignments where workout_id = 'w-push';
select case when count(*) = 1 then 'ok: note written' else 'FAIL: push trigger stopped the note' end from public.coach_notes where body = 'Nice work 15';
select case when count(*) = 1 then 'ok: token stored lower-case, sandbox' else 'FAIL: token not stored as sent' end from public.push_devices where token = :'tok' and sandbox;

-- the phone moves to the coach's account
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001501');
select public.register_push_device(:'tok');
reset role;
select case when owner = '00000000-0000-0000-0000-000000001501' then 'ok: token moved to who signed in' else 'FAIL: token kept old owner' end from public.push_devices where token = :'tok';

-- the client cannot remove it now; the coach can, on sign-out
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001502');
select public.unregister_push_device(:'tok');
reset role;
select case when count(*) = 1 then 'ok: not removed by someone else' else 'FAIL: removed by someone else' end from public.push_devices where token = :'tok';
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000001501');
select public.unregister_push_device(:'tok');
reset role;
select case when count(*) = 0 then 'ok: removed on sign-out' else 'FAIL: still there after sign-out' end from public.push_devices where token = :'tok';

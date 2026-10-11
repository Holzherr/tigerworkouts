\set ON_ERROR_STOP 0
-- The harness has no Supabase default privileges, so earlier scenarios grant everything; re-apply
-- 0010 after that grant, as on Supabase where the grants come first and the migration after.
grant select, insert, update, delete on all tables in schema public to authenticated;
\i ../migrations/0010_coaching_checks.sql
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000e1','m1@x'),('00000000-0000-0000-0000-0000000000e2','m2@x'),
 ('00000000-0000-0000-0000-0000000000e3','victim@x'),('00000000-0000-0000-0000-0000000000e4','vcoach@x');
insert into public.workouts(id,owner,title,data) values ('w-m1','00000000-0000-0000-0000-0000000000e1','M1','{}'),
 ('w-victim','00000000-0000-0000-0000-0000000000e3','Victim private','{}');
insert into public.coach_clients(coach,client) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e3');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- Two accounts the attacker owns: m1 coaches m2.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.coach_invites(coach) values (auth.uid()) returning code \gset
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select public.accept_coach_invite(:'code');
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-0000000000e2','w-m1');
update public.assignments set workout_id = 'w-victim' where coach = auth.uid();
\echo ^ expected RLS violation (re-pointing an assignment at a workout the coach does not own)
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select case when count(*) = 0 then 'ok: client cannot read the victim workout' else 'FAIL: client reads the victim workout' end from public.workouts where id = 'w-victim';
select case when not public.is_coach_of('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e3') then 'ok: no probing other pairs' else 'FAIL: is_coach_of answers for a third party' end;
reset role;

-- The victim's own link still reads as active to its two sides.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select case when public.is_coach_of('00000000-0000-0000-0000-0000000000e4', auth.uid()) then 'ok: own link answers' else 'FAIL: own link reads as inactive' end;
-- Ending a link changes its status and nothing else.
update public.coach_clients set coach = '00000000-0000-0000-0000-0000000000e1', status = 'ended' where client = auth.uid();
\echo ^ expected permission denied (rewriting who a link names)
update public.coach_clients set status = 'ended' where client = auth.uid();
reset role;
select case when coach = '00000000-0000-0000-0000-0000000000e4' and status = 'ended' then 'ok: ended, same coach' else 'FAIL: link rewritten or not ended' end
  from public.coach_clients where client = '00000000-0000-0000-0000-0000000000e3';

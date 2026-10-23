\set ON_ERROR_STOP 0
-- Earlier scenarios grant everything; put back 0011's column grant, as on Supabase.
revoke update on public.ai_coaches from authenticated;
grant update (name, status) on public.ai_coaches to authenticated;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000f1','ai1@x'),('00000000-0000-0000-0000-0000000000f2','ai2@x');
insert into public.workouts(id,owner,title,data) values ('w-ai1','00000000-0000-0000-0000-0000000000f1','AI made','{}'),
 ('w-ai2','00000000-0000-0000-0000-0000000000f2','Theirs','{}');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
-- No AI coach yet: nothing can be assigned as one.
insert into public.assignments(coach,client,workout_id) values (auth.uid(),auth.uid(),'w-ai1');
\echo ^ expected RLS violation (no AI coach on)
insert into public.ai_coaches(client) values (auth.uid());
select case when name = 'AI Coach' and status = 'active' then 'ok: AI coach on, default name' else 'FAIL: default AI coach row' end from public.ai_coaches;
insert into public.assignments(coach,client,workout_id,note) values (auth.uid(),auth.uid(),'w-ai1','Squats moved up 2.5 kg');
select case when count(*) = 1 then 'ok: AI coach assigns your own workout' else 'FAIL: AI assignment missing' end from public.assignments where coach = auth.uid() and client = auth.uid();
insert into public.assignments(coach,client,workout_id) values (auth.uid(),auth.uid(),'w-ai2');
\echo ^ expected RLS violation (AI coach assigning a workout you do not own)
insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-0000000000f2','w-ai1');
\echo ^ expected RLS violation (AI coach assigning to someone else)
-- Rename: 1 to 40 characters.
update public.ai_coaches set name = 'Tiger' where client = auth.uid();
select case when name = 'Tiger' then 'ok: renamed' else 'FAIL: rename' end from public.ai_coaches;
update public.ai_coaches set name = '  ' where client = auth.uid();
\echo ^ expected check violation (blank name)
update public.ai_coaches set name = repeat('x', 41) where client = auth.uid();
\echo ^ expected check violation (name over 40)
update public.ai_coaches set client = '00000000-0000-0000-0000-0000000000f2' where client = auth.uid();
\echo ^ expected permission denied (re-pointing the AI coach row)
reset role;

-- Someone else sees none of it and cannot switch it on for you.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select case when count(*) = 0 then 'ok: AI coach row is private' else 'FAIL: reads another person''s AI coach' end from public.ai_coaches;
select case when count(*) = 0 then 'ok: AI assignments are private' else 'FAIL: reads another person''s AI assignments' end from public.assignments where client = '00000000-0000-0000-0000-0000000000f1';
insert into public.ai_coaches(client) values ('00000000-0000-0000-0000-0000000000f1');
\echo ^ expected RLS violation (adding an AI coach for someone else)
reset role;

-- Removed: it can no longer assign; what it sent stays readable and removable by you.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.ai_coaches set status = 'ended' where client = auth.uid();
insert into public.assignments(coach,client,workout_id) values (auth.uid(),auth.uid(),'w-ai1');
\echo ^ expected RLS violation (AI coach removed)
select case when count(*) = 1 then 'ok: earlier AI assignment still yours' else 'FAIL: AI assignment gone after removal' end from public.assignments where client = auth.uid();
delete from public.assignments where client = auth.uid() and coach = auth.uid();
select case when count(*) = 0 then 'ok: you can delete it' else 'FAIL: AI assignment not deletable' end from public.assignments where client = auth.uid();
reset role;

-- G-13's metric counts PTs only; the AI coach counts on its own.
insert into public.assignments(coach,client,workout_id) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f1','w-ai1');
select (public.agent_snapshot(7)->>'pt_client_runs')::int as pt_before \gset
insert into public.sessions(id,owner,workout_id,title,started_at,completed,data) values ('s-ai1','00000000-0000-0000-0000-0000000000f1','w-ai1','AI made',now(),true,'{}');
select case when (public.agent_snapshot(7)->>'pt_client_runs')::int = :pt_before then 'ok: AI runs stay out of pt_client_runs' else 'FAIL: AI run counted as a PT run' end;
select case when (public.agent_snapshot(7)->>'ai_coach_runs')::int >= 1 then 'ok: ai_coach_runs counts it' else 'FAIL: ai_coach_runs missed it' end;

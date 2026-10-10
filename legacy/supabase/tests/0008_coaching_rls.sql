\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','coach@x','{"name":"Nick"}'),
 ('00000000-0000-0000-0000-00000000000b','client@x','{"name":"Priyanka"}'),
 ('00000000-0000-0000-0000-00000000000c','other@x','{"name":"Eve"}');
insert into public.workouts(id,owner,title,data) values ('w-coach','00000000-0000-0000-0000-00000000000a','Coach legs','{}'),('w-other','00000000-0000-0000-0000-00000000000c','Eve thing','{}');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- coach creates invite
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.coach_invites(coach,label) values (auth.uid(),'P') returning code \gset
\echo invite :code
-- coach cannot assign before link
insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-coach');
\echo ^ expected RLS violation (no link yet)
-- coach cannot accept own invite
select public.accept_coach_invite(:'code');
\echo ^ expected own-invite error
reset role;

-- anon sees invite info
set role anon; select pg_temp.as_user('');
select public.coach_invite_info(:'code') as info;
-- guests still read workouts and profiles (Discover, creator pages): the coaching policies are for signed-in callers
select count(*) as anon_reads_workouts from public.workouts;
select count(*) as anon_reads_profiles from public.profiles;
reset role;

-- client accepts
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.accept_coach_invite(:'code') as accepted;
insert into public.sessions(id,owner,workout_id,started_at,data) values ('s1',auth.uid(),'w-coach',now(),'{"startedFrom":"coach"}');
reset role;

-- eve tries to reuse
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.accept_coach_invite(:'code');
\echo ^ expected already-used
reset role;

-- coach assigns own workout, not someone else's
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.assignments(coach,client,workout_id,note) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-coach','Go easy') returning id as aid \gset
insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-other');
\echo ^ expected RLS violation (not my workout)
select count(*) as coach_sees_client_sessions from public.sessions;
select name as coach_sees_client_name from public.profiles where id='00000000-0000-0000-0000-00000000000b';
insert into public.coach_notes(coach,client,author,session_id,body) values (auth.uid(),'00000000-0000-0000-0000-00000000000b',auth.uid(),'s1','Nice work');
reset role;

-- client reads assignment + coach workout + note, writes reply
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select count(*) as client_assignments from public.assignments;
select title as client_sees_workout from public.workouts where id='w-coach';
select count(*) as client_notes from public.coach_notes;
insert into public.coach_notes(coach,client,author,body) values ('00000000-0000-0000-0000-00000000000a',auth.uid(),auth.uid(),'Thanks');
insert into public.assignments(coach,client,workout_id) values ('00000000-0000-0000-0000-00000000000a',auth.uid(),'w-coach');
\echo ^ expected RLS violation (client cannot assign)
reset role;

-- eve sees nothing
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select (select count(*) from public.assignments) a, (select count(*) from public.coach_notes) n, (select count(*) from public.sessions) s, (select count(*) from public.workouts where id='w-coach') w, (select count(*) from public.coach_clients) l;
reset role;

-- snapshot
select public.agent_snapshot(8)->'pt_client_runs' as pt_client_runs, public.agent_snapshot(8)->'pt_links' as links;

-- client ends link; coach loses access
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.coach_clients set status='ended' where coach='00000000-0000-0000-0000-00000000000a';
select count(*) as client_assignments_after_end from public.assignments;
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select count(*) as coach_sessions_after_end from public.sessions;
update public.coach_clients set status='active';
\echo ^ expected 0 rows / violation (coach cannot reactivate)
reset role;

\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.admins from anon, authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','coach@x','{"name":"Nick"}'),
 ('00000000-0000-0000-0000-00000000000b','client@x','{"name":"Priyanka"}'),
 ('00000000-0000-0000-0000-00000000000c','other@x','{"name":"Eve"}');
insert into public.workouts(id,owner,title,data) values ('w-coach','00000000-0000-0000-0000-00000000000a','Coach legs','{}'),('w-other','00000000-0000-0000-0000-00000000000c','Eve thing','{}');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- coach creates invite
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.coach_invites(coach,label) values (auth.uid(),'P') returning code \gset
select t.blocked($$insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-coach')$$, 'coach cannot assign before a link');
select t.fails(format('select public.accept_coach_invite(%L)', :'code'), 'own invite', 'coach cannot accept own invite');
reset role;

-- anon sees invite info
set role anon; select pg_temp.as_user('');
select t.ok(public.coach_invite_info(:'code')->>'name' = 'Nick', 'guest reads the invite''s coach name');
-- guests still read workouts and profiles (Discover, creator pages): the coaching policies are for signed-in callers
select t.ok(count(*) >= 0, 'guest reads workouts without a permission error') from public.workouts;
select t.ok(count(*) >= 0, 'guest reads profiles without a permission error') from public.profiles;
select t.fails($$select * from public.coach_invites$$, 'permission denied', 'guest reads no invites');
reset role;

-- client accepts
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(public.accept_coach_invite(:'code')->>'coach' = '00000000-0000-0000-0000-00000000000a', 'client accepts');
insert into public.sessions(id,owner,workout_id,started_at,data) values ('s1',auth.uid(),'w-coach',now(),'{"startedFrom":"coach"}');
reset role;

-- eve tries to reuse
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select t.fails(format('select public.accept_coach_invite(%L)', :'code'), 'already used', 'a used invite cannot be reused');
reset role;

-- coach assigns own workout, not someone else's
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.assignments(coach,client,workout_id,note) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-coach','Go easy');
select t.blocked($$insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-00000000000b','w-other')$$, 'coach cannot assign a workout they do not own');
select t.ok(count(*) = 1, 'coach reads the client''s sessions') from public.sessions;
select t.ok(name = 'Priyanka', 'coach reads the client''s name') from public.profiles where id='00000000-0000-0000-0000-00000000000b';
insert into public.coach_notes(coach,client,author,session_id,body) values (auth.uid(),'00000000-0000-0000-0000-00000000000b',auth.uid(),'s1','Nice work');
reset role;

-- client reads assignment + coach workout + note, writes reply
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(count(*) = 1, 'client reads the assignment') from public.assignments;
select t.ok(title = 'Coach legs', 'client reads the assigned workout') from public.workouts where id='w-coach';
select t.ok(count(*) = 1, 'client reads the note') from public.coach_notes;
insert into public.coach_notes(coach,client,author,body) values ('00000000-0000-0000-0000-00000000000a',auth.uid(),auth.uid(),'Thanks');
select t.blocked($$insert into public.assignments(coach,client,workout_id) values ('00000000-0000-0000-0000-00000000000a',auth.uid(),'w-coach')$$, 'client cannot assign');
select t.blocked($$insert into public.coach_notes(coach,client,author,body) values ('00000000-0000-0000-0000-00000000000a',auth.uid(),'00000000-0000-0000-0000-00000000000a','forged')$$, 'client cannot write a note as the coach');
reset role;

-- eve sees nothing
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.assignments) + (select count(*) from public.coach_notes) + (select count(*) from public.sessions)
  + (select count(*) from public.workouts where id='w-coach') + (select count(*) from public.coach_clients) + (select count(*) from public.coach_invites) = 0,
  'a third person reads nothing of the pair');
select t.blocked($$insert into public.coach_notes(coach,client,author,body) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b',auth.uid(),'hi')$$, 'a third person cannot write into the pair''s notes');
select t.blocked($$update public.coach_clients set status = 'ended'$$, 'a third person cannot end the link');
reset role;

-- snapshot
select t.ok((public.agent_snapshot(8)->>'pt_client_runs')::int >= 1 and (public.agent_snapshot(8)->>'pt_links')::int >= 1, 'agent_snapshot counts the PT run and link');

-- client ends link; coach loses access
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.coach_clients set status='ended' where coach='00000000-0000-0000-0000-00000000000a';
select t.ok(count(*) = 0, 'client reads no assignments after the end') from public.assignments;
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(count(*) = 0, 'coach reads no sessions after the end') from public.sessions;
select t.blocked($$update public.coach_clients set status='active'$$, 'coach cannot reactivate');
reset role;

\set ON_ERROR_STOP 0
-- Cross-user isolation on the five core tables, what anon reads, the 0013 guards, and that
-- delete_account removes everything an account holds. Users d1 (Dana) and d2 (Dev).
-- The harness has no Supabase default privileges; grant as Supabase does, then put back 0013's revoke.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.admins from anon, authenticated;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000d1','dana@x'),('00000000-0000-0000-0000-0000000000d2','dev@x');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- Dana writes one of everything.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
update public.profiles set name = 'Dana' where id = auth.uid();
insert into public.workouts(id,owner,title,public,data) values ('w-d1-priv',auth.uid(),'Private',false,'{}'),('w-d1-pub',auth.uid(),'Public',true,'{}');
insert into public.sessions(id,owner,workout_id,started_at,data) values ('s-d1',auth.uid(),'w-d1-priv',now(),'{}');
insert into public.exercises(key,owner,public,data) values ('x-d1-priv',auth.uid(),false,'{}'),('x-d1-pub',auth.uid(),true,'{}');
update public.user_state set favorites = '["w-d1-pub"]' where owner = auth.uid();
insert into public.device_metrics(owner,kind,started_at,data) values (auth.uid(),'workout',now(),'{}');
select t.ok(count(*) = 2, 'owner reads both own workouts') from public.workouts where owner = auth.uid();
select t.ok(count(*) = 1, 'owner reads own session') from public.sessions;
select t.ok(count(*) = 1, 'owner reads own device metrics') from public.device_metrics;
reset role;

-- Dev reads only what Dana made public, and changes none of it.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select t.ok(count(*) = 0, 'no one else''s profile without a handle') from public.profiles where id = '00000000-0000-0000-0000-0000000000d1';
select t.ok(string_agg(id, ',') = 'w-d1-pub', 'only the public workout') from public.workouts where owner = '00000000-0000-0000-0000-0000000000d1';
select t.ok(count(*) = 0, 'no one else''s sessions') from public.sessions;
select t.ok(string_agg(key, ',') = 'x-d1-pub', 'only the public exercise') from public.exercises where owner = '00000000-0000-0000-0000-0000000000d1';
select t.ok(count(*) = 1, 'only own user_state') from public.user_state;
select t.ok(count(*) = 0, 'no one else''s device metrics') from public.device_metrics;
select t.blocked($$update public.profiles set name = 'x' where id = '00000000-0000-0000-0000-0000000000d1'$$, 'cannot rename someone');
select t.blocked($$update public.workouts set title = 'x' where id = 'w-d1-pub'$$, 'cannot edit a public workout');
select t.blocked($$delete from public.workouts where id = 'w-d1-pub'$$, 'cannot delete a public workout');
select t.blocked($$insert into public.workouts(id,owner,title,data) values ('w-forged','00000000-0000-0000-0000-0000000000d1','x','{}')$$, 'cannot write a workout as someone');
select t.blocked($$insert into public.workouts(id,owner,title,data) values ('w-d1-priv',auth.uid(),'x','{}') on conflict (id) do update set title = 'x'$$, 'cannot take over a workout id by upsert');
select t.blocked($$insert into public.sessions(id,owner,started_at,data) values ('s-forged','00000000-0000-0000-0000-0000000000d1',now(),'{}')$$, 'cannot write a session as someone');
select t.blocked($$insert into public.sessions(id,owner,started_at,data) values ('s-d1',auth.uid(),now(),'{}') on conflict (id) do update set title = 'x'$$, 'cannot take over a session id by upsert');
select t.blocked($$update public.sessions set title = 'x' where id = 's-d1'$$, 'cannot edit someone''s session');
select t.blocked($$delete from public.sessions where id = 's-d1'$$, 'cannot delete someone''s session');
select t.blocked($$update public.exercises set data = '{"x":1}' where key = 'x-d1-pub'$$, 'cannot edit a public exercise');
select t.blocked($$delete from public.exercises where key = 'x-d1-pub'$$, 'cannot delete a public exercise');
select t.blocked($$update public.user_state set prefs = '{"x":1}' where owner = '00000000-0000-0000-0000-0000000000d1'$$, 'cannot write someone''s user_state');
select t.blocked($$insert into public.device_metrics(owner,kind,started_at,data) values ('00000000-0000-0000-0000-0000000000d1','day',now(),'{}')$$, 'cannot write someone''s device metrics');
select t.blocked($$delete from public.device_metrics where owner = '00000000-0000-0000-0000-0000000000d1'$$, 'cannot delete someone''s device metrics');
select t.fails($$select * from public.admins$$, 'permission denied', 'admins list is unreadable');
select t.ok(count(*) = 0, 'session_device answers own rows only') from public.session_device(now() - interval '1 hour', now());
reset role;

-- Guests (anon key, no sign-in) read public workouts and handled profiles only.
update public.profiles set handle = 'dana' where id = '00000000-0000-0000-0000-0000000000d1';
set role anon; select pg_temp.as_user('');
select t.ok(count(*) = 1, 'guest reads the handled profile') from public.profiles where id = '00000000-0000-0000-0000-0000000000d1';
select t.ok(string_agg(id, ',') = 'w-d1-pub', 'guest reads the public workout only') from public.workouts where owner = '00000000-0000-0000-0000-0000000000d1';
select t.fails($$select * from public.sessions$$, 'permission denied', 'guest reads no sessions');
select t.fails($$select * from public.user_state$$, 'permission denied', 'guest reads no user_state');
select t.fails($$select * from public.device_metrics$$, 'permission denied', 'guest reads no device metrics');
select t.fails($$insert into public.workouts(id,title,data) values ('w-guest','x','{}')$$, 'permission denied', 'guest writes no workout');
select t.fails($$select public.delete_account()$$, 'permission denied', 'guest cannot call delete_account');
select t.fails($$select public.session_device(now(), now())$$, 'permission denied', 'guest cannot call session_device');
reset role;

-- 0013 guards: credited imports are the admins' only; stored data has a size limit.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select t.fails($$insert into public.workouts(id,owner,title,public,data) values ('w-social',auth.uid(),'x',true,'{"source":{"kind":"social"}}')$$, 'only admins', 'non-admin cannot publish a credited import');
insert into public.workouts(id,owner,title,public,data) values ('w-social-priv',auth.uid(),'x',false,'{"source":{"kind":"social"}}');
select t.ok(count(*) = 1, 'a private credited row is allowed') from public.workouts where id = 'w-social-priv';
select t.fails($$update public.workouts set public = true where id = 'w-social-priv'$$, 'only admins', 'non-admin cannot publish it later');
select t.fails($$insert into public.sessions(id,owner,started_at,data) values ('s-huge',auth.uid(),now(),jsonb_build_object('x', repeat('a', 300000)))$$, 'sessions_data_size', 'oversized session refused');
select t.fails($$insert into public.workouts(id,owner,title,data) values ('w-long',auth.uid(),repeat('t', 201),'{}')$$, 'workouts_text_len', 'overlong title refused');
reset role;

-- Dana and Dev are linked (Dev coaches Dana); Dana deletes her account: nothing of hers is left.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
insert into public.coach_invites(coach) values (auth.uid()) returning code as dcode \gset
insert into public.workouts(id,owner,title,data) values ('w-d2-plan',auth.uid(),'Plan','{}');
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select t.ok(public.accept_coach_invite(:'dcode') is not null, 'client accepts the coach');
insert into public.ai_coaches(client) values (auth.uid());
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
insert into public.assignments(coach,client,workout_id) values (auth.uid(),'00000000-0000-0000-0000-0000000000d1','w-d2-plan');
insert into public.coach_notes(coach,client,author,session_id,body) values (auth.uid(),'00000000-0000-0000-0000-0000000000d1',auth.uid(),'s-d1','Good');
select t.ok(count(*) = 1, 'coach reads the linked client''s session') from public.sessions where owner = '00000000-0000-0000-0000-0000000000d1';
select t.blocked($$update public.sessions set title = 'x' where id = 's-d1'$$, 'coach cannot edit the client''s session');
select t.blocked($$update public.coach_notes set body = 'edited' where author = auth.uid()$$, 'a note cannot be edited');
select t.blocked($$delete from public.coach_notes where author = auth.uid()$$, 'a note cannot be deleted');
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select t.ok(count(*) = 0, 'client reads no coach invites') from public.coach_invites;
select public.delete_account();
reset role;
select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000d1'), 'delete_account: sign-in gone');
select t.ok(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.workouts where owner = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.sessions where owner = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.exercises where owner = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.user_state where owner = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.device_metrics where owner = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.coach_clients where client = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.assignments where client = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.coach_notes where client = '00000000-0000-0000-0000-0000000000d1')
  + (select count(*) from public.ai_coaches where client = '00000000-0000-0000-0000-0000000000d1') = 0,
  'delete_account: no row of hers in any table');
select t.ok((select count(*) from public.workouts where owner = '00000000-0000-0000-0000-0000000000d2') = 2, 'delete_account: the coach''s own workouts stay');
select t.ok((select accepted_by from public.coach_invites where code = :'dcode') is null, 'delete_account: the used invite no longer names her');

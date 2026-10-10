\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users(id,email,is_anonymous,created_at) values
 ('00000000-0000-0000-0000-0000000000a1',null,true,now()),
 ('00000000-0000-0000-0000-0000000000a2',null,true,now() - interval '8 days'),
 ('00000000-0000-0000-0000-0000000000a3','claimed@x',false,now() - interval '30 days');
insert into public.workouts(id,owner,title,public,data) values ('w-old-anon','00000000-0000-0000-0000-0000000000a2','Old anon',false,'{}');
create function pg_temp.as_user(u text, anon boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'is_anonymous', anon)::text, false);
end $$;

-- an anonymous caller asks for public: stored private
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', true);
insert into public.workouts(id,owner,title,public,data) values ('w-anon',auth.uid(),'Anon',true,'{}');
update public.workouts set public = true where id = 'w-anon';
insert into public.exercises(key,owner,public,data) values ('x-anon',auth.uid(),true,'{}');
reset role;
select public as anon_workout_public_expect_f from public.workouts where id = 'w-anon';
select public as anon_exercise_public_expect_f from public.exercises where key = 'x-anon';

-- a claimed (non-anonymous) caller can publish
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3', false);
insert into public.workouts(id,owner,title,public,data) values ('w-claimed',auth.uid(),'Claimed',true,'{}');
reset role;
select public as claimed_public_expect_t from public.workouts where id = 'w-claimed';

-- signed-in users can't run the cleanup
set role authenticated;
select public.delete_abandoned_anonymous_users();
\echo ^ expected permission denied
reset role;

-- cleanup removes only the 8-day-old anonymous user, and its workout with it
select public.delete_abandoned_anonymous_users() as deleted_expect_1;
select string_agg(right(id::text,2), ',' order by id) as users_left_expect_a1_a3 from auth.users where id::text like '%0000000000a_';
select count(*) as old_anon_workouts_expect_0 from public.workouts where id = 'w-old-anon';

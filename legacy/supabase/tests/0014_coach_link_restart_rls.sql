\set ON_ERROR_STOP 0
-- A8: a used invite code cannot bring back a link that was ended; a new invite can.
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000a81','a8coach@x'),('00000000-0000-0000-0000-000000000a82','a8client@x');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a81');
insert into public.coach_invites(coach) values (auth.uid()) returning code as old_code \gset
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a82');
select public.accept_coach_invite(:'old_code');
select public.accept_coach_invite(:'old_code');
select t.ok(public.is_coach_of('00000000-0000-0000-0000-000000000a81', auth.uid()), 'accepting the same code twice keeps the link');
reset role;

-- The coach ends it; the client tries the old code again.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a81');
update public.coach_clients set status = 'ended' where coach = auth.uid();
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a82');
select t.fails(format('select public.accept_coach_invite(%L)', :'old_code'), 'coaching ended', 'a used code cannot restart an ended link');
reset role;
select t.ok(status = 'ended', 'link stays ended') from public.coach_clients where coach = '00000000-0000-0000-0000-000000000a81';

-- A new invite from the coach starts it again.
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a81');
insert into public.coach_invites(coach) values (auth.uid()) returning code as new_code \gset
reset role; set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000a82');
select public.accept_coach_invite(:'new_code');
reset role;
select t.ok(status = 'active', 'a new invite restarts the link') from public.coach_clients where coach = '00000000-0000-0000-0000-000000000a81';

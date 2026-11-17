\set ON_ERROR_STOP 0
-- A3: a write carrying an older updated_at than the row's is refused (PT409); a deleted row sent
-- back with the updated_at seen before the delete is refused (PT410); writes without updated_at
-- (older apps) go through as before.
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.admins from anon, authenticated;
revoke all on public.deleted_rows from anon, authenticated;
grant select on public.deleted_rows to authenticated;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','g1@x'),('00000000-0000-0000-0000-0000000000b2','g2@x');
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.sessions(id,owner,started_at,data) values ('s-g1',auth.uid(),now(),'{"v":1}') returning updated_at as seen1 \gset
-- A write that sends the updated_at it read goes through, and moves updated_at on.
update public.sessions set data = '{"v":2}', updated_at = :'seen1' where id = 's-g1' returning updated_at as seen2 \gset
select t.ok(:'seen2'::timestamptz > :'seen1'::timestamptz, 'a fresh write moves updated_at on');
-- The other device still holds seen1: refused, by update and by upsert.
select t.fails(format($$update public.sessions set data = '{"v":"old"}', updated_at = %L where id = 's-g1'$$, :'seen1'), 'stale write', 'a stale update is refused');
select t.fails(format($$insert into public.sessions(id,owner,started_at,data,updated_at) values ('s-g1',auth.uid(),now(),'{"v":"old"}',%L) on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at$$, :'seen1'), 'stale write', 'a stale upsert is refused');
select t.ok(data->>'v' = '2', 'the newer write stays') from public.sessions where id = 's-g1';
-- Older apps send no updated_at: last write wins, as before.
update public.sessions set data = '{"v":3}' where id = 's-g1';
insert into public.sessions(id,owner,started_at,data) values ('s-g1',auth.uid(),now(),'{"v":4}') on conflict (id) do update set data = excluded.data;
select t.ok(data->>'v' = '4', 'a write without updated_at goes through') from public.sessions where id = 's-g1';
select updated_at as seen4 from public.sessions where id = 's-g1' \gset

-- Workouts: the same, with their own triggers in front of touch_workouts.
insert into public.workouts(id,owner,title,data) values ('w-g1',auth.uid(),'One','{}') returning updated_at as wseen \gset
update public.workouts set title = 'Two', updated_at = :'wseen' where id = 'w-g1';
select t.fails(format($$update public.workouts set title = 'Old', updated_at = %L where id = 'w-g1'$$, :'wseen'), 'stale write', 'a stale workout update is refused');
select t.ok(title = 'Two', 'the newer workout stays') from public.workouts where id = 'w-g1';

-- Deleted: a tombstone the owner can read and nobody can write.
delete from public.sessions where id = 's-g1';
select t.ok(count(*) = 1, 'the delete leaves a tombstone') from public.deleted_rows where kind = 'session' and id = 's-g1';
select t.blocked($$insert into public.deleted_rows(kind,id,owner) values ('session','s-x',auth.uid())$$, 'nobody writes tombstones');
select t.blocked($$delete from public.deleted_rows$$, 'nobody removes tombstones');
-- A device that read the row before the delete cannot bring it back.
select t.fails(format($$insert into public.sessions(id,owner,started_at,data,updated_at) values ('s-g1',auth.uid(),now(),'{"v":"back"}',%L)$$, :'seen4'), 'deleted', 'a deleted row sent back is refused');
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select t.ok(count(*) = 0, 'someone else reads no tombstones') from public.deleted_rows;
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
-- Put back without updated_at (an older app, or on purpose): it goes through, and the tombstone goes.
insert into public.sessions(id,owner,started_at,data) values ('s-g1',auth.uid(),now(),'{"v":"again"}');
select t.ok((select count(*) from public.sessions where id = 's-g1') = 1 and (select count(*) from public.deleted_rows where id = 's-g1') = 0, 'a row put back clears its tombstone');
delete from public.workouts where id = 'w-g1';
-- Deleting the account still works and takes the tombstones with it.
select public.delete_account();
reset role;
select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000b1') and not exists (select 1 from public.deleted_rows where owner = '00000000-0000-0000-0000-0000000000b1'), 'delete_account leaves no tombstone behind');
select t.ok(public.forget_old_deleted_rows() >= 0, 'the cleanup runs');

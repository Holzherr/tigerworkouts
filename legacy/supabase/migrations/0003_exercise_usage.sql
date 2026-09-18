-- How often each exercise appears across workouts (public + private), and demand for
-- user-added exercises that don't yet exist as structured library entries.

-- one row per (workout, exercise key) reference
create or replace view public.workout_exercise_refs as
select w.id as workout_id, w.owner, w.public, w.creator,
       coalesce(e->>'ex', b->>'ex') as exercise_key
from public.workouts w
cross join lateral jsonb_array_elements(w.data->'blocks') b
left join lateral jsonb_array_elements(case when b ? 'exercises' then b->'exercises' else '[]'::jsonb end) e on true
where coalesce(e->>'ex', b->>'ex') is not null;

-- usage per exercise key, joined to the library where it exists
create or replace view public.exercise_usage as
select r.exercise_key,
       ex.data->>'name' as name,
       ex.owner is null as is_seed,
       ex.owner as added_by,
       count(distinct r.workout_id) as workouts,
       count(distinct r.workout_id) filter (where r.public) as public_workouts,
       count(distinct coalesce(r.owner::text, r.creator)) as creators,
       (ex.data->>'clip') is not null as has_clip
from public.workout_exercise_refs r
left join public.exercises ex on ex.key = r.exercise_key
group by r.exercise_key, ex.data, ex.owner
order by workouts desc, creators desc;

-- demand: user-added exercises (owner not null), grouped by normalised name so
-- "goblet squat" and "Goblet Squat" count together. Promote to a seed entry when big enough.
create or replace view public.exercise_demand as
select lower(regexp_replace(ex.data->>'name', '[^a-zA-Z0-9]+', ' ', 'g')) as norm_name,
       min(ex.data->>'name') as name,
       count(distinct ex.owner) as users_added,
       array_agg(distinct ex.key) as keys,
       coalesce(sum(u.workouts), 0) as workouts_using
from public.exercises ex
left join public.exercise_usage u on u.exercise_key = ex.key
where ex.owner is not null
group by 1
order by users_added desc, workouts_using desc;

grant select on public.workout_exercise_refs, public.exercise_usage, public.exercise_demand to authenticated, anon;

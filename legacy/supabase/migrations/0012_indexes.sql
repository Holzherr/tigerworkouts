-- Indexes for the queries the apps make on every sync, and for the foreign keys Postgres walks
-- when an account is deleted (the daily anonymous purge included). Additive and safe to re-run.
-- From the 15 Nov 2026 data review. Until now only sessions(owner, started_at) and
-- device_metrics(owner, started_at) were indexed among the 0001 tables.

-- Own workouts, newest first: web sync, iOS fetch, MCP list_workouts (scope mine), creator pages.
create index if not exists workouts_owner_updated on public.workouts(owner, updated_at desc);
-- Discover and MCP list_workouts (scope public).
create index if not exists workouts_public_updated on public.workouts(updated_at desc) where public;
-- Own custom exercises: every sync on web and iOS, MCP search_exercises.
create index if not exists exercises_owner on public.exercises(owner) where owner is not null;
-- A workout's sessions: MCP get_workout / list_sessions by workout.
create index if not exists sessions_owner_workout on public.sessions(owner, workout_id, started_at desc);
-- "workouts: assigned to me" policy, and the cascade when a workout is deleted.
create index if not exists assignments_workout on public.assignments(workout_id);
-- Notes a client reads; cascades from users and assignments.
create index if not exists coach_notes_client on public.coach_notes(client, created_at);
create index if not exists coach_notes_author on public.coach_notes(author);
create index if not exists coach_notes_assignment on public.coach_notes(assignment_id) where assignment_id is not null;
create index if not exists coach_invites_accepted on public.coach_invites(accepted_by) where accepted_by is not null;

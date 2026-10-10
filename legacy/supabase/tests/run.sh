#!/bin/sh
# Applies every migration to a throwaway local Postgres (stubbed auth schema) and runs the RLS scenarios.
# Needs Postgres 15+ on PATH (brew install postgresql@17). Usage: legacy/supabase/tests/run.sh
set -eu
cd "$(dirname "$0")"
DIR=$(mktemp -d); PORT=${PORT:-54329}
initdb -D "$DIR" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR" -o "-p $PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l "$DIR/log" start >/dev/null
trap 'pg_ctl -D "$DIR" stop >/dev/null; rm -rf "$DIR"' EXIT
sleep 1
P="psql -q -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1"
$P -f stub-auth.sql
for f in ../migrations/*.sql; do $P -f "$f" >/dev/null 2>&1 || { echo "FAILED: $f"; $P -f "$f"; exit 1; }; done
psql -q -h 127.0.0.1 -p $PORT -U postgres -f 0008_coaching_rls.sql 2>&1 | grep -v '^$'

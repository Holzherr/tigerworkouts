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
for t in *_rls.sql; do echo "== $t"; psql -q -t -h 127.0.0.1 -p $PORT -U postgres -f "$t" 2>&1 | grep -v '^ *$'; done | tee "$DIR/out"
# Scenarios assert with t.ok / t.blocked / t.fails (stub-auth.sql), which print "FAIL: ..." when a
# rule does not hold. An error is a failure too, unless the next line says "^ expected".
! grep -q FAIL "$DIR/out" || { echo "Some scenario failed."; exit 1; }
awk '/ERROR:/ { if (err) bad = 1; err = $0; next } /^\^ expected/ { err = ""; next } { if (err) bad = 1; err = "" }
     END { if (err || bad) exit 1 }' "$DIR/out" || { echo "Unexpected SQL error (see ERROR lines above)."; exit 1; }

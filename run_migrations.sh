#!/bin/bash
PSQL=/opt/homebrew/Cellar/postgresql@12/12.22/bin/psql
HOST=db.gkzusfigajwcsfhhkvbs.supabase.co
PORT=5432
USER=postgres
DB=postgres
P1="Eldi1011"
P2="!!!@@@"
export PGPASSWORD="${P1}${P2}"

for f in "$@"; do
  echo "=== Running: $f ==="
  $PSQL -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -f "$f" 2>&1
  RC=$?
  echo "=== Exit code: $RC ==="
  if [ $RC -ne 0 ]; then
    echo "STOPPING due to error"
    exit $RC
  fi
done

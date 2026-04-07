#!/bin/bash
# Run SQL files against Supabase
export PGPASSWORD='Eldi1011!!!@@@'
PSQL=/opt/homebrew/Cellar/postgresql@12/12.22/bin/psql
HOST=db.gkzusfigajwcsfhhkvbs.supabase.co
PORT=5432
USER=postgres
DB=postgres

FILE="$1"
echo "=== Running: $FILE ==="
$PSQL -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -f "$FILE" 2>&1
echo "=== Done: $FILE (exit code: $?) ==="

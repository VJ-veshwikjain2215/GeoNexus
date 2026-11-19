#!/usr/bin/env bash
# Applies V*.sql to a scratch PostGIS database with plain psql and runs the behavioural assertions.
# No Java, Maven or Docker needed. Usage:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./validate-sql.sh [scratch_db_name]
# Creates the scratch database (dropping it first if it exists), so NEVER point this at real data.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
db="${1:-geonexus_validate}"
case "$db" in geonexus_validate*|geonexus_scratch*|geonexus_test*) ;; *) echo "refusing db name '$db' (must start with geonexus_validate/scratch/test)"; exit 2;; esac
psql -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
for f in $(ls "$here"/src/main/resources/db/migration/V*.sql | sort -V); do
  echo "applying $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"
done
out="$(psql -q -t -A -v ON_ERROR_STOP=1 -d "$db" -f "$here/src/test/resources/sql/schema_assertions.sql" 2>&1)" || {
  echo "$out" | grep -E "ERROR|CONTEXT" ; echo "SCHEMA ASSERTIONS FAILED"; exit 1; }
echo "$out" | grep -o "ok - .*"
echo "schema assertions passed"

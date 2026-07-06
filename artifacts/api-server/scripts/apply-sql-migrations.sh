#!/usr/bin/env bash
# Applies numbered sql/*.sql files once, tracked in videh_sql_migrations.
# Skips *seed* and *delete* files. Bootstraps history on existing production DBs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${VIDEOH_ENV_FILE:-$ROOT/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "apply-sql-migrations: DATABASE_URL not set — skipping"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "apply-sql-migrations: psql not found — skipping"
  exit 0
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS videh_sql_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

migration_num() {
  local base="$1"
  if [[ "$base" =~ ^([0-9]+)_ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "0"
  fi
}

should_skip_file() {
  local base="$1"
  case "$base" in
    *seed*|*delete*) return 0 ;;
  esac
  return 1
}

bootstrap_existing_db() {
  local count has_users
  count=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM videh_sql_migrations")
  [[ "$count" != "0" ]] && return 0

  has_users=$(psql "$DATABASE_URL" -tAc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users')")
  [[ "$has_users" != "t" ]] && return 0

  echo "Bootstrapping videh_sql_migrations for existing database (marking migrations < 076 as applied)..."
  for f in sql/[0-9]*.sql; do
    [[ -f "$f" ]] || continue
    local base num
    base=$(basename "$f")
    should_skip_file "$base" && continue
    num=$(migration_num "$base")
    [[ "$num" -lt 76 ]] || continue
    psql "$DATABASE_URL" -c \
      "INSERT INTO videh_sql_migrations (filename) VALUES ('$base') ON CONFLICT DO NOTHING"
  done
}

bootstrap_existing_db

for f in sql/[0-9]*.sql; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f")
  should_skip_file "$base" && continue

  applied=$(psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM videh_sql_migrations WHERE filename='$base' LIMIT 1")
  [[ "$applied" == "1" ]] && continue

  echo "Applying SQL migration: $base"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  psql "$DATABASE_URL" -c \
    "INSERT INTO videh_sql_migrations (filename) VALUES ('$base')"
done

echo "SQL migrations up to date."

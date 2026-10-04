#!/usr/bin/env bash
# Pruebas locales: Postgres 16 en /var/tmp/pgtest:5499 (db t) + mock de Supabase (54321) + next start (3000).
# Uso: e2e/run.sh [suite ...]   (sin argumentos: pedido notif listas tarea catalogo)
# Requiere .env.local apuntando al mock (ver e2e/README.md).
set -u
E=$(cd "$(dirname "$0")" && pwd); R=$(dirname "$E"); P=/var/tmp/pgtest
B=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
export S=${S:-/tmp/e2e-shots}; mkdir -p "$S"
[ -d "$E/node_modules/pg" ] || (cd "$E" && npm install --silent)

if [ ! -f $P/data/PG_VERSION ]; then
  mkdir -p $P && chown postgres $P
  su postgres -c "$B/initdb -D $P/data -U postgres -A trust" >/dev/null
fi
psql -h $P -p 5499 -U postgres -c 'select 1' >/dev/null 2>&1 || {
  su postgres -c "$B/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/pg.log start" >/dev/null; sleep 2; }

reset() {
  fuser -k 54321/tcp >/dev/null 2>&1; sleep 0.5
  psql -h $P -p 5499 -U postgres -qc 'drop database if exists t' -c 'create database t'
  for f in "$E/stub.sql" "$R"/supabase/migrations/*.sql "$R/supabase/seed.sql"; do
    psql -h $P -p 5499 -U postgres -d t -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "FALLA $f"; exit 1; }
  done
  setsid -f node "$E/mock-pg.mjs" >> "$S/mock.log" 2>&1 < /dev/null; sleep 1
}

reset
echo "RLS: $(psql -h $P -p 5499 -U postgres -d t -v ON_ERROR_STOP=1 -q -f "$R/supabase/tests/rls_test.sql" 2>&1 | grep -c 'ok -') ok"

if ! curl -s -o /dev/null http://localhost:3000/login; then
  (cd "$R" && NEXT_TELEMETRY_DISABLED=1 npx next build > "$S/build.log" 2>&1) || { tail -30 "$S/build.log"; exit 1; }
  (cd "$R" && NEXT_TELEMETRY_DISABLED=1 setsid -f npx next start -p 3000 > "$S/next.log" 2>&1 < /dev/null)
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/login && break; sleep 1; done
fi

fail=0
for t in "${@:-pedido notif listas tarea catalogo pms contactos}"; do
  for s in $t; do
    reset
    out=$(cd "$E" && node "e2e-$s.mjs" 2>&1)
    echo "$s: $(echo "$out" | grep -c '^ok') ok, $(echo "$out" | grep -c FALLA) fallas"
    echo "$out" | grep -E "FALLA|Error" | head -5
    echo "$out" | grep -q -E "FALLA|Error" && fail=1
  done
done
exit $fail

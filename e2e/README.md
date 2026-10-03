# Pruebas e2e locales

Sin Docker ni Supabase CLI: Postgres 16 local con stubs de `auth`/`storage`/`net` (`stub.sql`), migraciones y
seed reales, y `mock-pg.mjs`, un mock de Supabase (Auth, PostgREST, Storage, Resend) que ejecuta cada consulta
como el usuario logueado, con RLS real.

```bash
e2e/run.sh                    # todas: pedido notif listas tarea catalogo
e2e/run.sh catalogo           # una
```

`.env.local` para las pruebas (valores de prueba, no reales):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-de-prueba
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=secreto-de-prueba
RESEND_API_KEY=re_test
RESEND_API_URL=http://127.0.0.1:54321
EMAIL_FROM=Tecnica <tecnica@example.com>
```

Usuarios del seed, contraseña `test1234` en el mock. Capturas en `$S` (por defecto `/tmp/e2e-shots`).
`e2e-login.mjs` usa el mock viejo `mock-supabase.mjs` (solo Auth).
Playwright: el de `/opt/node22/lib/node_modules/playwright` (Chromium preinstalado).

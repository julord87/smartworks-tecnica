# Técnica Smartworks

Puerta de entrada única para pedir trabajo al área de Producción Técnica.
Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, Storage), deploy en Vercel.

## Estructura

```
src/
  proxy.ts               refresca la sesión y manda a /login si no hay usuario
  app/login/             formulario de enlace mágico
  app/auth/confirm/      destino del enlace (verifica token_hash y crea la sesión)
  app/auth/signout/      cierre de sesión (POST)
  lib/supabase/          clientes de Supabase para servidor y proxy
  lib/auth.ts            perfil del usuario logueado y guardas por rol
supabase/
  migrations/   esquema, RLS, storage y catálogo inicial de tareas
  seed.sql      datos de ejemplo inventados (solo local)
  tests/        pruebas de RLS y reglas de negocio
  templates/    plantillas del correo de acceso
  config.toml   configuración de Supabase CLI
```

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Clave pública (anon / publishable) |
| `NEXT_PUBLIC_SITE_URL` | app y Supabase Auth | URL pública de la app, sin barra final (`http://localhost:3000` en local) |
| `RESEND_API_KEY` | app | Clave de Resend para notificaciones (etapa final) |
| `EMAIL_FROM` | app | Remitente de las notificaciones, p. ej. `Técnica Smartworks <tecnica@tudominio.com>` |
| `SMTP_HOST` | Supabase Auth | `smtp.resend.com` |
| `SMTP_USER` | Supabase Auth | `resend` |
| `SMTP_PASS` | Supabase Auth | Clave de Resend (puede ser otra distinta a `RESEND_API_KEY`, con permiso solo de envío) |
| `SMTP_SENDER_EMAIL` | Supabase Auth | Remitente del enlace de acceso, p. ej. `acceso@tudominio.com` |

Copiar `.env.example` a `.env.local` y completar.

## Acceso

- Login por enlace mágico al correo.
- Se aceptan direcciones `@smartworks.es` y las que Técnica cargue en la tabla `allowed_emails`.
  El control está en la base de datos (trigger de alta en `auth.users`), no solo en la app.
- Quitar un correo de `allowed_emails` impide nuevas altas, pero no borra una cuenta ya creada:
  para eso, eliminar el usuario en Supabase > Authentication > Users.
- Rol por defecto `solicitante`. Para que alguien entre directamente como Técnica, cargar su correo
  en `allowed_emails` con `role = 'tecnica'` antes de su primer acceso:
  ```sql
  insert into public.allowed_emails (email, role) values ('nombre@smartworks.es', 'tecnica');
  ```
  Si el usuario ya existe: `update public.profiles set role = 'tecnica' where email = '...';`

## Permisos (RLS)

- Lectura: todo usuario autenticado ve proyectos, pedidos, tareas, adjuntos, entregables e historial.
- Escritura:
  - Cualquiera crea proyectos y pedidos (a su nombre).
  - Tareas: el solicitante en sus pedidos; Técnica solo en pedidos con "No sé qué necesito".
  - Estado, responsable, notas y fecha de una tarea: solo Técnica. El responsable debe tener rol `tecnica`.
  - Adjuntos y comentarios: miembros del proyecto (PM, creador, quien tiene un pedido en él, Técnica).
  - Entregables, catálogo y allowlist: solo Técnica.
  - Historial (`task_events`): inmutable. Los cambios de estado los registra un trigger con autor y fecha.
  - Pasar a "falta información" exige escribir qué falta.
- Archivos: bucket privado `archivos`, ruta `{project_id}/requests|tasks/{id}/{archivo}`, servidos con URL firmada.

## Correo del enlace de acceso (SMTP propio)

El servidor de correo por defecto de Supabase solo envía unos pocos correos por hora y no es apto para producción.
Hay que configurar SMTP propio con Resend:

1. **Resend**: crear cuenta, agregar y verificar el dominio del remitente (registros SPF, DKIM y,
   recomendado, DMARC en el DNS del dominio). Crear una API key con permiso "Sending access".
2. **Supabase** > Project Settings > Authentication > SMTP Settings > Enable custom SMTP:
   - Sender email: `SMTP_SENDER_EMAIL` (debe ser del dominio verificado)
   - Sender name: `Técnica Smartworks`
   - Host: `smtp.resend.com`, Port: `465`
   - Username: `resend`, Password: la API key de Resend
3. **Supabase** > Authentication > Rate Limits: subir "Emails sent per hour" (p. ej. 60).
4. **Supabase** > Authentication > URL Configuration:
   - Site URL: la URL de producción (`NEXT_PUBLIC_SITE_URL`)
   - Redirect URLs: `http://localhost:3000/**` y la URL de previews de Vercel si se usan.
5. **Supabase** > Authentication > Email Templates: en **Magic Link** y en **Confirm signup**
   pegar el contenido de `supabase/templates/magic_link.html` (asunto: "Tu enlace de acceso a Técnica Smartworks").
   El enlace usa `token_hash` y la ruta `/auth/confirm`, así funciona aunque el correo se abra en otro
   dispositivo o navegador.

En local (`supabase start`) los correos no salen: se ven en Inbucket, `http://localhost:54324`.
Para probar SMTP real en local, exportar las variables `SMTP_*` y poner `enabled = true` en `[auth.email.smtp]` de `supabase/config.toml`.

## Desarrollo local

Requisitos: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
supabase start          # levanta Postgres, Auth, Storage e Inbucket en Docker
supabase db reset       # aplica migraciones + seed.sql
cp .env.example .env.local   # completar con la URL y anon key que muestra `supabase status`
npm run dev
```

Usuarios de ejemplo (seed): `tecnica@smartworks.es`, `rigging@smartworks.es` (Técnica),
`pm.ana@smartworks.es`, `pm.marcos@smartworks.es` (solicitantes). Entrar con el enlace que llega a Inbucket.

### Pruebas de la base de datos

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

Corre dentro de una transacción que se descarta. Cada comprobación imprime `ok - ...`; cualquier fallo corta con error.

## Proyecto remoto

- Supabase: proyecto `smartworks-tecnica` (ref `bjsnhwtlwffarvulnmee`, región eu-west-2).
  Migraciones 0001-0006 aplicadas; sin datos de ejemplo. `julian@smartworks.es` pre-asignado como Técnica.
- Vercel: proyecto `tecnica-smartworks`, producción en `https://tecnica-smartworks.vercel.app` (rama `main`).
  Variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave publishable) y `NEXT_PUBLIC_SITE_URL` cargadas.

Las migraciones se aplicaron con el conector de Supabase, que registra su propia versión en el historial.
Antes de usar `supabase db push` por primera vez, alinear el historial:

```bash
supabase link --project-ref bjsnhwtlwffarvulnmee
supabase migration list            # comparar local y remoto
supabase migration repair --status applied 20261003000001 20261003000002 20261003000003 20261003000004 20261003000005 20261003000006
```

## Deploy en Vercel

Importar el repositorio, framework Next.js, y cargar las variables de la tabla anterior (las de la app).

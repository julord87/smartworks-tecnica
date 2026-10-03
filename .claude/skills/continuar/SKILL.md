---
name: continuar
description: Retomar el trabajo en Técnica Smartworks desde donde quedó. Usar al empezar una sesión nueva, cuando el usuario dice "seguí", "continuá", "dónde estábamos" o pide el estado del proyecto.
---

# Continuar Técnica Smartworks

Leer primero `CLAUDE.md` (forma de trabajar) y `README.md` (pantallas, permisos, notificaciones, variables).
Después revisar este archivo y actualizarlo al cerrar cada etapa (sección "Estado" y "Pendientes").

## Qué es
App interna, puerta de entrada única para pedir trabajo a Producción Técnica (antes llegaba por WhatsApp).
Pedidos con tareas, adjuntos, fechas y estados; el solicitante ve el estado sin preguntar.
Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind v4, Supabase (Postgres, Auth, Storage), Vercel.

## Infra (IDs, sin secretos)
- GitHub: `julord87/smartworks-tecnica`. Trabajar en la rama `claude/tecnica-smartworks-app-84oiw2`,
  PR a `main` por etapa, squash merge. Si el PR anterior ya está mergeado, rehacer la rama desde `origin/main`.
- Supabase: proyecto `bjsnhwtlwffarvulnmee` (eu-west-2). Usar el conector MCP de Supabase.
  `apply_migration` se cuelga con `DROP` y con SQL largo: usar `create or replace`, columnas nuevas, partir en trozos.
  Los nombres de migración remotos no coinciden con los locales (ver README, "Proyecto remoto").
- Vercel: proyecto `prj_6sUjrCmThT7E9nGjxzSsuO96CARr`, team `team_y0iY2GmuYhQjGSUiKrvfDlIa`, región lhr1.
  Producción: https://tecnica-smartworks.vercel.app (rama `main`). Verificar previews y prod con el conector MCP de Vercel.
- El contenedor no llega a `*.supabase.co` ni a `*.vercel.app` (proxy 403). Para probar prod desde afuera:
  `select net.http_get('https://tecnica-smartworks.vercel.app/...')` en Supabase y leer `net._http_response`.

## Estado (al 2026-10-03)
Etapas mergeadas en `main`, todas en producción:
1. Esquema + RLS + storage + catálogo (13 tipos)
2. Login (enlace mágico y contraseña), allowlist con rol pre-asignado
3. Nuevo pedido (proyecto existente/nuevo, proveedor, tareas, adjuntos directos a Storage, copias)
4. Notificaciones por correo (cola en la base + pg_cron + pg_net + `/api/cron/*` + Resend), resumen diario 8:00 Madrid
5. Mis pedidos y Bandeja de Técnica - PR #5
6. Páginas de Tarea y Proyecto - PR #6
7. Cómo trabajamos (`content/como-trabajamos.md`) y Catálogo (`/catalogo`) - PR #7

Producción: único usuario `julian@smartworks.es` (Técnica). Usuarios de prueba ya borrados. Sin datos de ejemplo.

## Pendientes
- **Correo**: el usuario tiene que crear la API key en Resend (dominio verificado, sugerido `tecnica.smartworks.es`)
  y cargar `RESEND_API_KEY` (Sensitive) en Vercel. `EMAIL_FROM` ya está cargado; revisar que use el dominio verificado.
  Cuando avise: redeploy de producción y probar un envío real (por ejemplo, pasar una tarea a "falta información").
  Nunca pedir ni aceptar la clave por chat.
- **Supabase Auth (lo hace el usuario en el panel)**: Site URL = URL de prod, Redirect URLs, plantillas
  `supabase/templates/*.html`, SMTP propio con Resend, activar "leaked password protection".
- **Seguridad**: el usuario pegó en el chat la secret key de Supabase y su contraseña: recordarle rotar la key
  y cambiar la contraseña si no lo confirmó. Nunca usar ni guardar esa key.
- **Codex**: necesita en el entorno cloud (Network access > Custom) `api.openai.com`, `chatgpt.com`, `auth.openai.com`
  y después `codex login`.
- **awesome-claude-skills**: es una lista; esperar que el usuario elija skills concretos.
- Ideas no pedidas: no hacerlas sin que el usuario las pida.

## Pruebas (antes de cada PR)
```bash
npx tsc --noEmit
e2e/run.sh            # Postgres local + RLS (72) + build + e2e: pedido notif listas tarea catalogo
```
Ver `e2e/README.md` (`.env.local` de prueba apunta al mock). Si falta Postgres: `apt` ya trae PostgreSQL 16 en
`/usr/lib/postgresql/16/bin`; `run.sh` crea el cluster en `/var/tmp/pgtest`.
Para capturas con Chromium usar `--font-render-hinting=none`. No usar `pkill -f run.sh` (mata la propia shell).

## Diseño
Identidad Smartworks: bandas rojo/azul/rojo, Archivo, radio 0, sin sombras, iconos Phosphor, labels arriba.
Tokens en `src/app/globals.css` (`sw-blue` #2E3192, `sw-red` #E5194B, `ink`, `muted`, `zebra`, `panel`, `line`).
Interfaz en español rioplatense neutro ("podés", "elegí").

## Herramientas del usuario (se pierden al cambiar de contenedor; reinstalar si las pide)
```bash
claude plugin marketplace add openai/codex-plugin-cc && claude plugin install codex@openai-codex --scope user
npm install -g @openai/codex
claude plugin marketplace add DietrichGebert/ponytail && claude plugin install ponytail@ponytail --scope user
claude plugin marketplace add asklokesh/loki-mode && claude plugin install loki-mode@loki-mode --scope user
npm install -g loki-mode
npx -y skills add https://github.com/vercel-labs/skills --skill find-skills -y -g
```
Nombres verificados: `codex@openai-codex`, `ponytail@ponytail`, `loki-mode@loki-mode`.

## Reglas fijas
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y la línea `Claude-Session` de la sesión actual.
- PR body termina con "🤖 Generated with [Claude Code](https://claude.com/claude-code)" y la URL de la sesión.
- Sin datos reales de clientes en seeds ni pruebas. Sin secretos en el repo.

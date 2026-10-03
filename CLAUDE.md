# Técnica Smartworks: forma de trabajar con Claude

## Autonomía
- Avanzar etapa por etapa sin pedir permiso: código, migraciones, pruebas, PR, merge a `main` y deploy.
- Cada etapa: PR propio, esperar el deploy de vista previa de Vercel en verde, mergear, verificar producción.
- Preguntar solo si es algo duro: borrar datos de producción, gastos o compras, cambios de seguridad
  que abran acceso, decisiones de producto ambiguas que cambian el resultado.
- Las decisiones menores se toman con criterio y se informan al final, no se preguntan.

## Convenciones
- Interfaz en español. Identidad Smartworks (bandas rojo/azul/rojo, Archivo, radio 0, sin sombras).
- Migraciones en `supabase/migrations/`, aplicadas también en el proyecto remoto
  (`bjsnhwtlwffarvulnmee`). La herramienta de Supabase se cuelga con `DROP`: evitarlo (usar
  `create or replace`, envoltorios o columnas nuevas).
- Pruebas antes de cerrar: `supabase/tests/rls_test.sql` en Postgres local, `tsc`, `next build`,
  e2e con Playwright contra el mock respaldado por Postgres (todo junto: `e2e/run.sh`).
- Al empezar una sesión: skill `continuar` (`.claude/skills/continuar/SKILL.md`); actualizarlo al cerrar cada etapa.
- Sin datos reales de clientes en seeds ni pruebas.

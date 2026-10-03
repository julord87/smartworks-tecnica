-- Tecnica Smartworks - extensiones para notificaciones
-- pg_net: llamadas HTTP desde la base (avisar a la app). pg_cron: tareas programadas.
-- Condicional para que las migraciones corran tambien en un Postgres sin estas extensiones (pruebas locales).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

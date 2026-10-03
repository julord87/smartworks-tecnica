-- Tecnica Smartworks - tareas programadas (solo donde existe pg_cron, es decir en Supabase)
-- Antes de que funcionen hay que cargar app_url y cron_secret en public.app_config (ver README).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Cada 2 minutos: si hay notificaciones listas, avisa a la app para que las envie
    perform cron.schedule('notificaciones', '*/2 * * * *', 'select public.notifications_kick()');
    -- Resumen para Tecnica: pg_cron va en UTC; 6 y 7 UTC cubren las 8:00 de Madrid en verano e invierno.
    -- La app solo envia en la llamada que cae a las 8 en Madrid.
    perform cron.schedule('resumen-diario', '0 6,7 * * 1-5', 'select public.digest_kick()');
  end if;
end $$;

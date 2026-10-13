-- Tecnica Smartworks - tipo de tarea "Render 3D de escena" (Blender), al final del catalogo
insert into public.task_types (position, name, description, needs, delivers, min_days, is_discovery)
select coalesce(max(position), 0) + 1,
  'Render 3D de escena',
  'Render en Blender del evento completo, un área puntual o el escenario (keynote, stand). Imagen, video o 3D interactivo.',
  'Plano del venue con medidas, diseño o propuesta de escenario, branding y contenidos de pantallas, puntos de vista a mostrar.',
  'Renders en imagen; video o 3D interactivo (se ve en la app) si se pide.',
  7, false
from public.task_types
on conflict (name) do nothing;

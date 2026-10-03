-- Datos de ejemplo (solo desarrollo local: `supabase db reset`). Todo inventado.
-- Usuarios: 2 de Tecnica, 2 solicitantes. Login local por magic link (Inbucket/Mailpit).

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tecnica@smartworks.es', '{"full_name":"Laura Técnica"}', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rigging@smartworks.es', '{"full_name":"Diego Rigging"}', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'pm.ana@smartworks.es', '{"full_name":"Ana PM"}', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'pm.marcos@smartworks.es', '{"full_name":"Marcos PM"}', now(), now(), now());

update public.profiles set role = 'tecnica'
where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.projects (id, name, client, event_date, venue, pm_id, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Convención Anual Aurora', 'Laboratorios Aurora',
   current_date + 45, 'Palacio de Congresos Norte', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-000000000002', 'Lanzamiento Modelo Zeta', 'Motores Zeta',
   current_date + 20, 'Nave 7 - Recinto Ferial Sur', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-000000000003', 'Gala Fundación Faro', 'Fundación Faro',
   current_date + 70, null, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1');

insert into public.requests (id, project_id, requested_by, comment) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
   'Necesitamos cerrar la propuesta técnica para presentar al cliente.'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2',
   'Lanzamiento con pantalla LED grande y coche en escenario.'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1',
   'Todavía no hay venue. Adjunto briefing.');

insert into public.tasks (id, request_id, task_type_id, due_date, notes, created_by)
select v.id::uuid, v.request_id::uuid, tt.id, current_date + v.days, v.notes, v.created_by::uuid
from (values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4,  12, 'Presupuesto objetivo en el proposal.', '00000000-0000-0000-0000-0000000000b1'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 6,   8, null,                                   '00000000-0000-0000-0000-0000000000b1'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 11,  3, 'Pantalla central + 2 laterales.',      '00000000-0000-0000-0000-0000000000b2'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 10,  10, 'Escaleta de show.',                   '00000000-0000-0000-0000-0000000000b2'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 0,   5, null,                                   '00000000-0000-0000-0000-0000000000b1')
) as v(id, request_id, pos, days, notes, created_by)
join public.task_types tt on tt.position = v.pos;

-- Algunos cambios de estado (el trigger genera el historial; author_id queda null en seed)
update public.tasks set status = 'en_curso', assignee_id = '00000000-0000-0000-0000-0000000000a1'
where id = '30000000-0000-0000-0000-000000000001';

update public.tasks set status = 'falta_informacion', status_note = 'Falta plano de rigging del venue.',
  assignee_id = '00000000-0000-0000-0000-0000000000a2'
where id = '30000000-0000-0000-0000-000000000002';

update public.tasks set status = 'entregada', assignee_id = '00000000-0000-0000-0000-0000000000a1'
where id = '30000000-0000-0000-0000-000000000003';

insert into public.deliverables (task_id, url, file_name, note, uploaded_by) values
  ('30000000-0000-0000-0000-000000000003', 'https://example.com/specs-zeta-v1', 'Specs LED Zeta v1',
   'Ficha de specs por superficie.', '00000000-0000-0000-0000-0000000000a1');

insert into public.task_events (task_id, author_id, kind, body) values
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'comentario',
   'Lo pido al venue y lo subo esta semana.');

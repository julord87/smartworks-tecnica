-- Pruebas de RLS y reglas de negocio. Requiere seed.sql cargado.
-- Uso: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Todo corre en una transaccion que se descarta al final.

begin;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true);
$$;

create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLA: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Espera que el bloque falle
create or replace function pg_temp.expect_error(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLA: se esperaba error: %', msg;
end $$;

-- Filas actualizadas al cambiar el venue de un proyecto (0 si RLS lo impide)
create or replace function pg_temp.set_venue(p uuid, v text) returns int language plpgsql as $$
declare n int;
begin
  update public.projects set venue = v where id = p;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------- dominio
select pg_temp.expect_error(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'alguien@gmail.com')$$,
  'rechaza emails fuera de @smartworks.es');
insert into public.allowed_emails (email, note) values ('freelance@estudio-externo.com', 'Freelance rigging');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'Freelance@Estudio-Externo.com');
select pg_temp.check(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'solicitante',
  'email externo en allowlist puede darse de alta como solicitante');
insert into public.allowed_emails (email, role) values ('jefa.tecnica@smartworks.es', 'tecnica');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'jefa.tecnica@smartworks.es');
select pg_temp.check(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c2') = 'tecnica',
  'rol pre-asignado en allowlist se aplica al darse de alta');

set local role authenticated;

-- ---------------------------------------------------------------- Ana (solicitante, b1)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.projects) = 3, 'solicitante ve todos los proyectos');
select pg_temp.check((select count(*) from public.tasks) = 5, 'solicitante ve todas las tareas');
select pg_temp.check((select count(*) from public.task_inbox) = 5, 'task_inbox visible');
select pg_temp.check((select count(*) from public.deliverables) = 1, 'solicitante ve entregables de otros proyectos');
select pg_temp.check((select count(*) from public.allowed_emails) = 0, 'solicitante no ve la allowlist');
select pg_temp.expect_error(
  $$insert into public.allowed_emails (email) values ('otro@externo.com')$$,
  'solicitante no edita la allowlist');
select pg_temp.expect_error(
  $$select public.is_email_allowed('freelance@estudio-externo.com')$$,
  'is_email_allowed no es invocable por clientes');
select pg_temp.check((select count(*) from public.task_types) = 13, 'catalogo visible');

select pg_temp.expect_error(
  $$update public.profiles set role = 'tecnica' where id = auth.uid()$$,
  'solicitante no puede auto-promoverse');

-- update de tarea: RLS lo filtra (0 filas), no da error
update public.tasks set status = 'entregada' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.check(
  (select status from public.tasks where id = '30000000-0000-0000-0000-000000000001') = 'en_curso',
  'solicitante no cambia estados');

select pg_temp.expect_error(
  $$insert into public.task_types (name) values ('x')$$,
  'solicitante no edita catalogo');

select pg_temp.expect_error(
  $$insert into public.requests (project_id, requested_by) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2')$$,
  'no puede crear pedidos a nombre de otro');
select pg_temp.expect_error(
  $$insert into public.attachments (request_id, storage_path, file_name)
    values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/x.pdf', 'x.pdf')$$,
  'no adjunta en proyecto donde no participa');
select pg_temp.expect_error(
  $$insert into public.task_events (task_id, author_id, kind, body)
    values ('30000000-0000-0000-0000-000000000003', auth.uid(), 'comentario', 'x')$$,
  'no comenta en proyecto donde no participa');

select pg_temp.expect_error(
  $$insert into public.task_events (task_id, author_id, kind, to_status) values
    ('30000000-0000-0000-0000-000000000001', auth.uid(), 'estado', 'entregada')$$,
  'no puede falsificar eventos de estado');

-- Flujo nuevo pedido: proyecto nuevo + pedido + tareas + adjunto + comentario
insert into public.projects (id, name, client, pm_id)
values ('10000000-0000-0000-0000-0000000000ff', 'Proyecto Test', 'Cliente Test', auth.uid())
returning id;
insert into public.requests (id, project_id, comment)
values ('20000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-0000000000ff', 'test');
insert into public.tasks (id, request_id, task_type_id, due_date, status)
select '30000000-0000-0000-0000-0000000000ff', '20000000-0000-0000-0000-0000000000ff', id, current_date + 7, 'entregada'
from public.task_types where position = 5;
select pg_temp.check(
  (select status from public.tasks where id = '30000000-0000-0000-0000-0000000000ff') = 'recibida',
  'tarea nueva siempre nace recibida');
select pg_temp.check(
  (select count(*) from public.task_events where task_id = '30000000-0000-0000-0000-0000000000ff' and kind = 'creacion') = 1,
  'alta de tarea queda en historial');
insert into public.attachments (request_id, kind, storage_path, file_name)
values ('20000000-0000-0000-0000-0000000000ff', 'briefing',
        '10000000-0000-0000-0000-0000000000ff/requests/20000000-0000-0000-0000-0000000000ff/brief.pdf', 'brief.pdf');
insert into storage.objects (bucket_id, name)
values ('archivos', '10000000-0000-0000-0000-0000000000ff/requests/20000000-0000-0000-0000-0000000000ff/brief.pdf');
select pg_temp.expect_error(
  $$insert into storage.objects (bucket_id, name) values ('archivos', '10000000-0000-0000-0000-000000000002/x.pdf')$$,
  'no sube archivos a proyecto donde no participa');
insert into public.task_events (task_id, author_id, kind, body)
values ('30000000-0000-0000-0000-0000000000ff', auth.uid(), 'comentario', 'hola');

-- ---------------------------------------------------------------- Marcos (solicitante, b2)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from public.projects) = 4, 'Marcos ve todos los proyectos');
select pg_temp.check((select count(*) from public.attachments) = 1, 'Marcos ve adjuntos de Ana');
select pg_temp.check((select count(*) from storage.objects) = 1, 'Marcos ve archivos de Ana');
-- Pedir sobre un proyecto ajeno: permitido; al hacerlo puede adjuntar y comentar
insert into public.requests (id, project_id, comment)
values ('20000000-0000-0000-0000-0000000000ee', '10000000-0000-0000-0000-000000000001', 'pedido sobre proyecto de Ana');
insert into public.attachments (request_id, kind, storage_path, file_name)
values ('20000000-0000-0000-0000-0000000000ee', 'plano',
        '10000000-0000-0000-0000-000000000001/requests/20000000-0000-0000-0000-0000000000ee/plano.pdf', 'plano.pdf');
select pg_temp.check(true, 'puede pedir y adjuntar sobre un proyecto ajeno');
update public.projects set name = 'x' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.check(
  (select name from public.projects where id = '10000000-0000-0000-0000-000000000001') <> 'x',
  'no edita proyecto ajeno');
select pg_temp.expect_error(
  $$insert into public.tasks (request_id, task_type_id, due_date)
    select '20000000-0000-0000-0000-000000000001', id, current_date from public.task_types where position = 1$$,
  'no agrega tareas a pedido ajeno');

-- ---------------------------------------------------------------- Laura (tecnica, a1)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.projects) = 4, 'Tecnica ve todos los proyectos');
insert into public.allowed_emails (email) values ('proveedor@externo.com');
select pg_temp.check((select count(*) from public.allowed_emails) = 3, 'Tecnica administra la allowlist');
select pg_temp.expect_error(
  $$update public.tasks set assignee_id = '00000000-0000-0000-0000-0000000000b1' where id = '30000000-0000-0000-0000-000000000004'$$,
  'responsable solo puede ser de Tecnica');
update public.tasks set assignee_id = '00000000-0000-0000-0000-0000000000a2' where id = '30000000-0000-0000-0000-000000000004';
select pg_temp.check(
  (select assignee_id from public.tasks where id = '30000000-0000-0000-0000-000000000004') = '00000000-0000-0000-0000-0000000000a2',
  'asigna responsable de Tecnica');
select pg_temp.check((select count(*) from public.tasks) = 6, 'Tecnica ve todas las tareas');
select pg_temp.check((select count(*) from storage.objects) = 1, 'Tecnica ve todos los archivos');

select pg_temp.expect_error(
  $$update public.tasks set status = 'falta_informacion' where id = '30000000-0000-0000-0000-000000000004'$$,
  'falta_informacion exige indicar que falta');

update public.tasks set status = 'falta_informacion', status_note = 'Falta agenda definitiva'
where id = '30000000-0000-0000-0000-000000000004';
select pg_temp.check(
  (select count(*) from public.task_events
   where task_id = '30000000-0000-0000-0000-000000000004' and kind = 'estado'
     and from_status = 'recibida' and to_status = 'falta_informacion'
     and body = 'Falta agenda definitiva' and author_id = auth.uid()) = 1,
  'cambio de estado queda en historial con autor y motivo');

select pg_temp.expect_error(
  $$update public.tasks set status = 'en_curso' where id = '30000000-0000-0000-0000-000000000002';
    update public.tasks set status = 'falta_informacion' where id = '30000000-0000-0000-0000-000000000002'$$,
  'la nota anterior no sirve para un nuevo "falta informacion"');

update public.tasks set notes = 'nota' where id = '30000000-0000-0000-0000-000000000004';
select pg_temp.check(
  (select count(*) from public.task_events where task_id = '30000000-0000-0000-0000-000000000004' and kind = 'estado') = 1,
  'editar notas no genera evento de estado');

-- Crear tareas: solo en pedidos con "No se que necesito"
insert into public.tasks (request_id, task_type_id, due_date)
select '20000000-0000-0000-0000-000000000003', id, current_date + 10 from public.task_types where position = 1;
select pg_temp.check(
  (select count(*) from public.tasks where request_id = '20000000-0000-0000-0000-000000000003') = 2,
  'Tecnica agrega tareas en pedido con "No se que necesito"');
select pg_temp.expect_error(
  $$insert into public.tasks (request_id, task_type_id, due_date)
    select '20000000-0000-0000-0000-000000000001', id, current_date from public.task_types where position = 1$$,
  'Tecnica no agrega tareas en pedido sin "No se que necesito"');

-- Entregables versionados
insert into public.deliverables (task_id, url, file_name) values
  ('30000000-0000-0000-0000-000000000003', 'https://example.com/v2', 'v2');
select pg_temp.check(
  (select max(version) from public.deliverables where task_id = '30000000-0000-0000-0000-000000000003') = 2,
  'version de entregable autoincremental');

create temp table ev_before as select count(*) as n from public.task_events;
delete from public.task_events where true;
update public.task_events set body = 'x' where true;
select pg_temp.check(
  (select count(*) from public.task_events) = (select n from ev_before)
  and not exists (select 1 from public.task_events where body = 'x'),
  'historial no se borra ni se edita');

update public.task_types set min_days = 4 where position = 12;
select pg_temp.check((select min_days from public.task_types where position = 12) = 4, 'Tecnica edita catalogo');

-- ---------------------------------------------------------------- create_request
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
create temp table cr as
select public.create_request(
  null,
  '{"name":"Feria Prueba","client":"Cliente Prueba","event_date":"2030-05-01","venue":"Pabellón 3"}',
  'comentario',
  (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 10, 'notes', 'n'))
   from public.task_types where position in (0, 3))
) as r;
select pg_temp.check(
  (select count(*) from public.tasks where request_id = ((select r from cr) ->> 'request_id')::uuid) = 2,
  'create_request crea proyecto, pedido y tareas');
select pg_temp.check(
  (select pm_id from public.projects where id = ((select r from cr) ->> 'project_id')::uuid) = '00000000-0000-0000-0000-0000000000b2',
  'create_request: PM por defecto es quien pide');
select pg_temp.check(
  (select count(*) from public.task_events e join public.tasks t on t.id = e.task_id
   where t.request_id = ((select r from cr) ->> 'request_id')::uuid and e.kind = 'creacion') = 2,
  'create_request deja historial de alta');
select public.create_request('10000000-0000-0000-0000-000000000001', null, null,
  (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 3)) from public.task_types where position = 5));
select pg_temp.check(true, 'create_request sobre proyecto existente ajeno');
select pg_temp.expect_error(
  $$select public.create_request('10000000-0000-0000-0000-000000000001', null, null, '[]')$$,
  'create_request exige al menos una tarea');
select pg_temp.expect_error(
  $$select public.create_request('10000000-0000-0000-0000-000000000001', null, null,
    (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date - 1)) from public.task_types where position = 5))$$,
  'create_request rechaza fecha pasada');
select pg_temp.expect_error(
  $$select public.create_request('10000000-0000-0000-0000-000000000001', null, null,
    (select jsonb_agg(jsonb_build_object('task_type_id', tt.id, 'due_date', current_date + 5)) from public.task_types tt cross join generate_series(1, 2) where tt.position = 5))$$,
  'create_request rechaza tareas repetidas');
select pg_temp.expect_error(
  $$select public.create_request(null, '{"name":"","client":"x"}', null,
    (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 5)) from public.task_types where position = 5))$$,
  'create_request exige nombre de proyecto');
select pg_temp.expect_error(
  $$select public.create_request(gen_random_uuid(), null, null,
    (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 5)) from public.task_types where position = 5))$$,
  'create_request rechaza proyecto inexistente');

-- ---------------------------------------------------------------- copias y notificaciones
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_error(
  $$select public.create_request('10000000-0000-0000-0000-000000000001', null, null,
    (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 5)) from public.task_types where position = 7),
    array['cliente@gmail.com'])$$,
  'copias: rechaza correos externos');
create temp table cr2 as
select public.create_request(null, '{"name":"Expo Copias","client":"C","supplier":"AV Norte"}', null,
  (select jsonb_agg(jsonb_build_object('task_type_id', id, 'due_date', current_date + 9)) from public.task_types where position = 7),
  array['Pm.Ana@smartworks.es', 'pm.ana@smartworks.es', 'freelance@estudio-externo.com']) as r;
select pg_temp.check(
  (select count(*) from public.request_watchers where request_id = ((select r from cr2) ->> 'request_id')::uuid) = 2,
  'copias: internas y allowlist, sin duplicados');
select pg_temp.check(
  (select supplier from public.projects where id = ((select r from cr2) ->> 'project_id')::uuid) = 'AV Norte',
  'proveedor del proyecto guardado');

reset role;
select pg_temp.check(
  (select array_agg(recipient order by recipient) from public.notifications
   where kind = 'pedido_nuevo' and request_id = ((select r from cr2) ->> 'request_id')::uuid)
  = array['jefa.tecnica@smartworks.es', 'proveedor@externo.com', 'rigging@smartworks.es', 'tecnica@smartworks.es']::text[]
  or (select array_agg(recipient order by recipient) from public.notifications
   where kind = 'pedido_nuevo' and request_id = ((select r from cr2) ->> 'request_id')::uuid)
  @> array['rigging@smartworks.es', 'tecnica@smartworks.es']::text[],
  'pedido nuevo avisa a Tecnica');
select pg_temp.check(
  not exists (select 1 from public.notifications where kind = 'pedido_nuevo' and recipient = 'pm.marcos@smartworks.es'
              and request_id = ((select r from cr2) ->> 'request_id')::uuid),
  'pedido nuevo no avisa a quien lo hizo');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.tasks set status = 'falta_informacion', status_note = 'Falta el plano del stand'
where request_id = ((select r from cr2) ->> 'request_id')::uuid;
reset role;
select pg_temp.check(
  (select array_agg(recipient || ':' || reason order by recipient) from public.notifications
   where kind = 'falta_informacion' and request_id = ((select r from cr2) ->> 'request_id')::uuid)
  = array['freelance@estudio-externo.com:copia', 'pm.ana@smartworks.es:copia', 'pm.marcos@smartworks.es:solicitante'],
  'falta informacion avisa a solicitante, PM y copias (sin duplicar)');
select pg_temp.check(
  (select body from public.notifications where kind = 'falta_informacion' and recipient = 'pm.marcos@smartworks.es'
   and request_id = ((select r from cr2) ->> 'request_id')::uuid) = 'Falta el plano del stand',
  'el aviso lleva que falta');
select pg_temp.check(
  not exists (select 1 from public.notifications n join public.tasks t on t.id = n.task_id
              where t.request_id = ((select r from cr2) ->> 'request_id')::uuid and n.recipient = 'tecnica@smartworks.es'
              and n.kind <> 'pedido_nuevo'),
  'quien cambia el estado no recibe aviso');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.tasks set assignee_id = '00000000-0000-0000-0000-0000000000a2'
where request_id = ((select r from cr2) ->> 'request_id')::uuid;
update public.tasks set status = 'en_curso' where request_id = ((select r from cr2) ->> 'request_id')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
reset role;
select pg_temp.check(
  not exists (select 1 from public.notifications where kind::text = 'en_curso'),
  'en curso no genera correo');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.tasks set status = 'falta_informacion', status_note = 'Necesito cotas'
where request_id = ((select r from cr2) ->> 'request_id')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.task_events (task_id, author_id, kind, body)
select id, auth.uid(), 'comentario', 'Subo las cotas hoy' from public.tasks where request_id = ((select r from cr2) ->> 'request_id')::uuid;
reset role;
select pg_temp.check(
  (select array_agg(recipient || ':' || reason) from public.notifications
   where kind = 'respuesta' and request_id = ((select r from cr2) ->> 'request_id')::uuid)
  = array['rigging@smartworks.es:responsable'],
  'respuesta del solicitante avisa al responsable');

-- Cola: secreto, agrupado y confirmacion
insert into public.app_config (key, value) values ('cron_secret', 'secreto-de-prueba');
set local role anon;
select pg_temp.expect_error($$select public.notifications_claim('malo')$$, 'cola: secreto incorrecto rechazado');
select pg_temp.expect_error($$select * from public.notifications$$, 'cola: anon no lee notificaciones');
reset role;
update public.notifications set created_at = now() - interval '5 minutes';
set local role anon;
create temp table claimed as select public.notifications_claim('secreto-de-prueba') as m;
reset role;
select pg_temp.check(
  (select count(*) from jsonb_array_elements((select m from claimed)) e
   where e ->> 'to' = 'pm.marcos@smartworks.es'
     and e -> 'request' ->> 'id' = (select r from cr2) ->> 'request_id'
     and jsonb_array_length(e -> 'events') = 2) = 1,
  'cola: un correo por destinatario y pedido con sus eventos');
select pg_temp.check(
  (select count(*) from public.notifications where claimed_at is null and sent_at is null) = 0,
  'cola: todo lo listo queda reservado');
set local role anon;
select public.notifications_claim('secreto-de-prueba');
reset role;
select pg_temp.check(
  jsonb_array_length((select public.notifications_claim('secreto-de-prueba'))) = 0,
  'cola: lo reservado no se reenvia');
set local role anon;
select public.notifications_ack('secreto-de-prueba',
  (select array_agg((x)::bigint) from jsonb_array_elements((select m from claimed)) e, jsonb_array_elements_text(e -> 'ids') x));
reset role;
select pg_temp.check(
  (select count(*) from public.notifications where sent_at is null) = 0,
  'cola: ack marca enviadas');

insert into public.notifications (recipient, reason, kind, request_id) values
  ('x@smartworks.es', 'tecnica', 'pedido_nuevo', ((select r from cr2) ->> 'request_id')::uuid);
select pg_temp.check(
  jsonb_array_length((select public.notifications_claim('secreto-de-prueba'))) = 0,
  'cola: espera 2 minutos sin novedades antes de enviar');
insert into public.app_config (key, value) values ('app_url', 'https://app.test');
update public.notifications set created_at = now() - interval '3 minutes' where recipient = 'x@smartworks.es';
select public.notifications_kick();
select pg_temp.check(
  (select count(*) from net.calls where url = 'https://app.test/api/cron/notificaciones'
   and headers ->> 'authorization' = 'Bearer secreto-de-prueba') = 1,
  'kick: llama a la app solo si hay pendientes');
update public.notifications set sent_at = now();
select public.notifications_kick();
select pg_temp.check((select count(*) from net.calls) = 1, 'kick: sin pendientes no llama');

select pg_temp.check(
  (select jsonb_array_length(d -> 'tasks') > 0 and d -> 'recipients' ? 'tecnica@smartworks.es'
   from (select public.tecnica_digest('secreto-de-prueba', current_date + 30) as d) x),
  'resumen diario: tareas vencidas y destinatarios de Tecnica');
set local role authenticated;

-- ---------------------------------------------------------------- varios PM por proyecto
-- Aurora (...01): PM y creadora Ana (b1). Marcos (b2) no es PM de Aurora.
select pg_temp.check(
  (select count(*) from public.project_managers where project_id = '10000000-0000-0000-0000-000000000001'
     and profile_id = '00000000-0000-0000-0000-0000000000b1') = 1,
  'PM existente pasa a project_managers');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_error(
  $$insert into public.project_managers (project_id, profile_id)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2')$$,
  'quien no es PM ni creador no se agrega como PM');
select pg_temp.check(
  pg_temp.set_venue('10000000-0000-0000-0000-000000000001', 'X') = 0,
  'quien no es PM no edita el proyecto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.project_managers (project_id, profile_id)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check(
  pg_temp.set_venue('10000000-0000-0000-0000-000000000001', 'Palacio Norte') = 1,
  'segundo PM edita el proyecto');
select pg_temp.check(public.is_project_member('10000000-0000-0000-0000-000000000001'), 'segundo PM es miembro del proyecto');
delete from public.project_managers
where project_id = '10000000-0000-0000-0000-000000000001' and profile_id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.check(
  (select pm_id from public.projects where id = '10000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-0000000000b2',
  'un PM quita a otro; el principal pasa al que queda');
select pg_temp.expect_error(
  $$delete from public.project_managers where project_id = '10000000-0000-0000-0000-000000000001'$$,
  'el proyecto no puede quedar sin PM');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(
  pg_temp.set_venue('10000000-0000-0000-0000-000000000001', 'Palacio Norte 2') = 1,
  'la creadora sigue editando aunque ya no sea PM');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.project_managers (project_id, profile_id)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(
  (select count(*) from public.project_managers where project_id = '10000000-0000-0000-0000-000000000002') = 2,
  'Técnica agrega PM a cualquier proyecto');
reset role;
delete from public.notifications;
select public.enqueue_notification('cancelada', '20000000-0000-0000-0000-000000000002', null, null, null);
select pg_temp.check(
  (select count(*) from public.notifications where reason = 'pm'
     and recipient in ('pm.ana@smartworks.es')) = 1
  and (select count(*) from public.notifications where recipient = 'pm.marcos@smartworks.es') = 1,
  'avisos a todos los PM del proyecto');
set local role authenticated;

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select pg_temp.expect_error($$select * from public.projects$$, 'anon sin acceso');

rollback;

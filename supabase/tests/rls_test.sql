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

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select pg_temp.expect_error($$select * from public.projects$$, 'anon sin acceso');

rollback;

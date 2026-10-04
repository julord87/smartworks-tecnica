-- Tecnica Smartworks - contactos por proyecto
-- Tipos: proveedor, cliente, venue y tecnico del venue. Cada tipo de tarea dice cuales exige
-- (task_types.required_contacts); create_request no deja enviar el pedido si faltan.

create type public.contact_kind as enum ('proveedor', 'cliente', 'venue', 'venue_tecnico');

create or replace function public.contact_kind_label(k public.contact_kind)
returns text
language sql immutable set search_path = ''
as $$
  select case k
    when 'proveedor' then 'Proveedor'
    when 'cliente' then 'Cliente'
    when 'venue' then 'Venue'
    when 'venue_tecnico' then 'Técnico del venue'
  end;
$$;

create table public.project_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        public.contact_kind not null,
  name        text not null check (length(trim(name)) > 0),
  company     text,
  email       text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index project_contacts_project_idx on public.project_contacts (project_id);

alter table public.project_contacts enable row level security;

-- Leen todos. Cualquiera agrega (al pedir sobre un proyecto ajeno tiene que poder cargar lo que falta).
-- Borran: miembros del proyecto o quien lo cargo.
create policy project_contacts_select on public.project_contacts
  for select to authenticated using (true);

create policy project_contacts_insert on public.project_contacts
  for insert to authenticated
  with check (created_by = auth.uid());

create policy project_contacts_delete on public.project_contacts
  for delete to authenticated
  using (public.is_project_member(project_id) or created_by = auth.uid());

alter table public.task_types
  add column required_contacts public.contact_kind[] not null default '{}';

update public.task_types set required_contacts = '{venue_tecnico}'
where name in ('Visita técnica al venue', 'Toma de medidas', 'Overlay sobre el plano de rigging del venue');
update public.task_types set required_contacts = '{proveedor}'
where name in ('Specs de contenidos por superficie', 'Validación técnica de contenidos antes de montaje');

-- create_request con contactos. Las firmas anteriores quedan como envoltorios, sin DROP.
create or replace function public.create_request(
  p_project_id uuid,
  p_new_project jsonb,
  p_comment text,
  p_tasks jsonb,
  p_watchers text[],
  p_contacts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project_id uuid := p_project_id;
  v_request_id uuid;
  v_task jsonb;
  v_type_id uuid;
  v_due date;
  v_seen uuid[] := '{}';
  v_email text;
  v_contact jsonb;
  v_missing text;
begin
  if v_uid is null then
    raise exception 'Sesión no válida';
  end if;

  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'Marca al menos una tarea';
  end if;
  if jsonb_array_length(p_tasks) > 20 then
    raise exception 'Demasiadas tareas en un pedido';
  end if;
  if p_contacts is not null and jsonb_typeof(p_contacts) = 'array' and jsonb_array_length(p_contacts) > 30 then
    raise exception 'Demasiados contactos';
  end if;
  if coalesce(array_length(p_watchers, 1), 0) > 20 then
    raise exception 'Demasiados correos en copia';
  end if;

  if (v_project_id is null) = (p_new_project is null) then
    raise exception 'Elige un proyecto existente o crea uno nuevo';
  end if;

  if v_project_id is null then
    if length(trim(coalesce(p_new_project ->> 'name', ''))) = 0 then
      raise exception 'Falta el nombre del proyecto';
    end if;
    if length(trim(coalesce(p_new_project ->> 'client', ''))) = 0 then
      raise exception 'Falta el cliente del proyecto';
    end if;

    insert into public.projects (name, client, event_date, venue, supplier, pm_id, created_by)
    values (
      trim(p_new_project ->> 'name'),
      trim(p_new_project ->> 'client'),
      nullif(p_new_project ->> 'event_date', '')::date,
      nullif(trim(coalesce(p_new_project ->> 'venue', '')), ''),
      nullif(trim(coalesce(p_new_project ->> 'supplier', '')), ''),
      coalesce(nullif(p_new_project ->> 'pm_id', '')::uuid, v_uid),
      v_uid
    )
    returning id into v_project_id;
  elsif not exists (select 1 from public.projects where id = v_project_id) then
    raise exception 'El proyecto no existe';
  end if;

  for v_contact in select * from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) loop
    insert into public.project_contacts (project_id, kind, name, company, email, phone)
    values (
      v_project_id,
      (v_contact ->> 'kind')::public.contact_kind,
      trim(coalesce(v_contact ->> 'name', '')),
      nullif(trim(coalesce(v_contact ->> 'company', '')), ''),
      nullif(lower(trim(coalesce(v_contact ->> 'email', ''))), ''),
      nullif(trim(coalesce(v_contact ->> 'phone', '')), '')
    );
  end loop;

  insert into public.requests (project_id, requested_by, comment)
  values (v_project_id, v_uid, nullif(trim(coalesce(p_comment, '')), ''))
  returning id into v_request_id;

  for v_task in select * from jsonb_array_elements(p_tasks) loop
    v_type_id := (v_task ->> 'task_type_id')::uuid;
    v_due := nullif(v_task ->> 'due_date', '')::date;

    if v_type_id = any (v_seen) then
      raise exception 'Hay una tarea repetida';
    end if;
    v_seen := v_seen || v_type_id;

    if not exists (select 1 from public.task_types where id = v_type_id and active) then
      raise exception 'Tipo de tarea no disponible';
    end if;
    if v_due is null then
      raise exception 'Cada tarea necesita fecha límite';
    end if;
    if v_due < current_date then
      raise exception 'La fecha límite no puede ser anterior a hoy';
    end if;

    insert into public.tasks (request_id, task_type_id, due_date, notes, created_by)
    values (v_request_id, v_type_id, v_due, nullif(trim(coalesce(v_task ->> 'notes', '')), ''), v_uid);
  end loop;

  select string_agg(public.contact_kind_label(k), ', ' order by k) into v_missing
  from (
    select distinct unnest(tt.required_contacts) as k
    from public.tasks t join public.task_types tt on tt.id = t.task_type_id
    where t.request_id = v_request_id
  ) req
  where not exists (select 1 from public.project_contacts c where c.project_id = v_project_id and c.kind = req.k);
  if v_missing is not null then
    raise exception 'Faltan contactos del proyecto: %', v_missing;
  end if;

  for v_email in
    select distinct lower(trim(e)) from unnest(coalesce(p_watchers, '{}')) as e where length(trim(e)) > 0
  loop
    insert into public.request_watchers (request_id, email, added_by) values (v_request_id, v_email, v_uid);
  end loop;

  return jsonb_build_object('project_id', v_project_id, 'request_id', v_request_id);
end;
$$;

revoke execute on function public.create_request(uuid, jsonb, text, jsonb, text[], jsonb) from public, anon;
grant execute on function public.create_request(uuid, jsonb, text, jsonb, text[], jsonb) to authenticated;

create or replace function public.create_request(
  p_project_id uuid,
  p_new_project jsonb,
  p_comment text,
  p_tasks jsonb,
  p_watchers text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select public.create_request(p_project_id, p_new_project, p_comment, p_tasks, p_watchers, '[]'::jsonb); $$;

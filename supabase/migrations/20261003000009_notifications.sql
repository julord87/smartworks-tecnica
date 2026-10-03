-- Tecnica Smartworks - proveedor, copias de pedido y notificaciones por correo
--
-- Flujo: triggers -> public.notifications (una fila por destinatario) -> pg_cron llama a la app
-- (/api/cron/notificaciones) solo si hay pendientes -> la app agrupa por destinatario y pedido,
-- envia con Resend y confirma con notifications_ack.
-- La app no usa la clave de servicio: las funciones de cola exigen un secreto compartido (app_config).

-- ---------------------------------------------------------------------------
-- Proveedor del proyecto
-- ---------------------------------------------------------------------------
alter table public.projects add column supplier text;

-- ---------------------------------------------------------------------------
-- Configuracion privada (sin acceso desde la API)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create or replace function public.app_config_get(p_key text)
returns text
language sql stable security definer set search_path = ''
as $$ select value from public.app_config where key = p_key; $$;
revoke execute on function public.app_config_get(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Copias: correos internos a notificar en un pedido
-- ---------------------------------------------------------------------------
create table public.request_watchers (
  request_id  uuid not null references public.requests (id) on delete cascade,
  email       text not null check (email = lower(trim(email))),
  added_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (request_id, email)
);

create or replace function public.request_watchers_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_email_allowed(new.email) then
    raise exception 'Solo se pueden poner en copia correos internos: %', new.email;
  end if;
  return new;
end;
$$;
revoke execute on function public.request_watchers_check() from public, anon, authenticated;

create trigger request_watchers_check
  before insert or update on public.request_watchers
  for each row execute function public.request_watchers_check();

alter table public.request_watchers enable row level security;

create policy request_watchers_select on public.request_watchers
  for select to authenticated using (true);

create policy request_watchers_insert on public.request_watchers
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and (
      public.is_tecnica()
      or exists (select 1 from public.requests r where r.id = request_id and r.requested_by = (select auth.uid()))
    )
  );

create policy request_watchers_delete on public.request_watchers
  for delete to authenticated
  using (
    public.is_tecnica()
    or exists (select 1 from public.requests r where r.id = request_id and r.requested_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- create_request: suma proveedor del proyecto nuevo y copias
-- ---------------------------------------------------------------------------
-- Nueva firma con p_watchers obligatorio (sin default, para que PostgREST no tenga dos candidatas).
-- La firma anterior queda como envoltorio, sin DROP.
create or replace function public.create_request(
  p_project_id uuid,
  p_new_project jsonb,
  p_comment text,
  p_tasks jsonb,
  p_watchers text[]
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

  for v_email in
    select distinct lower(trim(e)) from unnest(coalesce(p_watchers, '{}')) as e where length(trim(e)) > 0
  loop
    insert into public.request_watchers (request_id, email, added_by) values (v_request_id, v_email, v_uid);
  end loop;

  return jsonb_build_object('project_id', v_project_id, 'request_id', v_request_id);
end;
$$;

revoke execute on function public.create_request(uuid, jsonb, text, jsonb, text[]) from public, anon;
grant execute on function public.create_request(uuid, jsonb, text, jsonb, text[]) to authenticated;

create or replace function public.create_request(
  p_project_id uuid,
  p_new_project jsonb,
  p_comment text,
  p_tasks jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select public.create_request(p_project_id, p_new_project, p_comment, p_tasks, '{}'::text[]); $$;

-- ---------------------------------------------------------------------------
-- Cola de notificaciones: una fila por destinatario
-- ---------------------------------------------------------------------------
create type public.notification_kind as enum (
  'pedido_nuevo',       -- a Tecnica
  'falta_informacion',  -- a solicitante, PM y copias
  'entregada',
  'cancelada',
  'respuesta'           -- el solicitante responde a una tarea en falta_informacion: a Tecnica
);

create table public.notifications (
  id          bigint generated always as identity primary key,
  recipient   text not null,
  reason      text not null,  -- tecnica | responsable | solicitante | pm | copia
  kind        public.notification_kind not null,
  request_id  uuid not null references public.requests (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  body        text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text
);
create index notifications_pending_idx on public.notifications (request_id, created_at) where sent_at is null;
create index notifications_task_idx on public.notifications (task_id);
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- Calcula destinatarios y encola. Nunca se notifica a quien hizo el cambio.
create or replace function public.enqueue_notification(
  p_kind public.notification_kind,
  p_request_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_body text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_email text := (select email from public.profiles where id = p_actor_id);
begin
  insert into public.notifications (recipient, reason, kind, request_id, task_id, actor_id, body)
  select distinct on (d.email) d.email, d.reason, p_kind, p_request_id, p_task_id, p_actor_id, p_body
  from (
    -- Tecnica: pedidos nuevos y respuestas sin responsable asignado
    select p.email, 'tecnica' as reason, 3 as prio
    from public.profiles p
    where p.role = 'tecnica'
      and (p_kind = 'pedido_nuevo'
           or (p_kind = 'respuesta' and (select assignee_id from public.tasks where id = p_task_id) is null))
    union all
    -- Responsable de la tarea: respuestas
    select p.email, 'responsable', 1
    from public.tasks t join public.profiles p on p.id = t.assignee_id
    where p_kind = 'respuesta' and t.id = p_task_id
    union all
    -- Solicitante, PM y copias: cambios de estado que les importan
    select p.email, 'solicitante', 1
    from public.requests r join public.profiles p on p.id = r.requested_by
    where p_kind in ('falta_informacion', 'entregada', 'cancelada') and r.id = p_request_id
    union all
    select p.email, 'pm', 2
    from public.requests r join public.projects pr on pr.id = r.project_id join public.profiles p on p.id = pr.pm_id
    where p_kind in ('falta_informacion', 'entregada', 'cancelada') and r.id = p_request_id
    union all
    select w.email, 'copia', 3
    from public.request_watchers w
    where p_kind in ('falta_informacion', 'entregada', 'cancelada') and w.request_id = p_request_id
  ) d
  where d.email is distinct from v_actor_email
  order by d.email, d.prio;
end;
$$;
revoke execute on function public.enqueue_notification(public.notification_kind, uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- Pedido nuevo
create or replace function public.notify_request_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_notification('pedido_nuevo', new.id, null, new.requested_by, new.comment);
  return null;
end;
$$;
revoke execute on function public.notify_request_created() from public, anon, authenticated;

create trigger notify_request_created
  after insert on public.requests
  for each row execute function public.notify_request_created();

-- Cambios de estado y respuestas del solicitante
create or replace function public.notify_task_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;

  if new.kind = 'estado' and new.to_status in ('falta_informacion', 'entregada', 'cancelada') then
    perform public.enqueue_notification(new.to_status::text::public.notification_kind, v_task.request_id, new.task_id,
                                        new.author_id, new.body);
  elsif new.kind = 'comentario'
        and v_task.status = 'falta_informacion'
        and not exists (select 1 from public.profiles where id = new.author_id and role = 'tecnica') then
    perform public.enqueue_notification('respuesta', v_task.request_id, new.task_id, new.author_id, new.body);
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_task_event() from public, anon, authenticated;

create trigger notify_task_event
  after insert on public.task_events
  for each row execute function public.notify_task_event();

-- Adjuntos que sube el solicitante a una tarea en falta_informacion cuentan como respuesta
create or replace function public.notify_task_attachment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  if new.task_id is null then
    return null;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  if v_task.status = 'falta_informacion'
     and not exists (select 1 from public.profiles where id = new.uploaded_by and role = 'tecnica') then
    perform public.enqueue_notification('respuesta', v_task.request_id, new.task_id, new.uploaded_by,
                                        'Nuevo adjunto: ' || new.file_name);
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_task_attachment() from public, anon, authenticated;

create trigger notify_task_attachment
  after insert on public.attachments
  for each row execute function public.notify_task_attachment();

-- ---------------------------------------------------------------------------
-- Funciones que usa la app (anon + secreto compartido)
-- ---------------------------------------------------------------------------
create or replace function public.check_cron_secret(p_secret text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_expected text := public.app_config_get('cron_secret');
begin
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;

-- Toma los correos listos para enviar, agrupados por destinatario y pedido.
-- Un pedido se envia cuando lleva 2 minutos sin novedades, o 10 desde la primera pendiente.
create or replace function public.notifications_claim(p_secret text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  perform public.check_cron_secret(p_secret);

  -- Caducan las que no se pudieron enviar en 2 dias o tras 5 intentos
  update public.notifications
  set sent_at = now(), last_error = coalesce(last_error, '') || ' [descartada]'
  where sent_at is null and (created_at < now() - interval '2 days' or attempts >= 5);

  with ready_requests as (
    select n.request_id
    from public.notifications n
    where n.sent_at is null and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
    group by n.request_id
    having max(n.created_at) < now() - interval '2 minutes'
        or min(n.created_at) < now() - interval '10 minutes'
  ),
  picked as (
    update public.notifications n
    set claimed_at = now(), attempts = n.attempts + 1
    where n.sent_at is null
      and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
      and n.request_id in (select request_id from ready_requests)
    returning n.*
  ),
  grouped as (
    select
      p.recipient,
      p.request_id,
      jsonb_build_object(
        'to', p.recipient,
        'recipient_name', (select full_name from public.profiles where email = p.recipient),
        'reason', (array_agg(p.reason order by p.id))[1],
        'ids', jsonb_agg(p.id order by p.id),
        'request', (
          select jsonb_build_object(
            'id', r.id,
            'comment', r.comment,
            'created_at', r.created_at,
            'requested_by', coalesce(rp.full_name, rp.email),
            'project', jsonb_build_object('id', pr.id, 'name', pr.name, 'client', pr.client,
                                          'event_date', pr.event_date, 'venue', pr.venue, 'supplier', pr.supplier,
                                          'pm', coalesce(pm.full_name, pm.email)),
            'tasks', (
              select coalesce(jsonb_agg(jsonb_build_object(
                       'id', t.id, 'name', tt.name, 'due_date', t.due_date, 'status', t.status, 'notes', t.notes,
                       'min_days', tt.min_days)
                     order by t.due_date, tt.position), '[]')
              from public.tasks t join public.task_types tt on tt.id = t.task_type_id
              where t.request_id = r.id
            ),
            'attachments', (
              select coalesce(jsonb_agg(jsonb_build_object('file_name', a.file_name, 'kind', a.kind)
                     order by a.created_at), '[]')
              from public.attachments a where a.request_id = r.id
            )
          )
          from public.requests r
          join public.projects pr on pr.id = r.project_id
          join public.profiles rp on rp.id = r.requested_by
          join public.profiles pm on pm.id = pr.pm_id
          where r.id = p.request_id
        ),
        'events', jsonb_agg(jsonb_build_object(
          'id', p.id,
          'kind', p.kind,
          'task_id', p.task_id,
          'task_name', (select tt.name from public.tasks t join public.task_types tt on tt.id = t.task_type_id
                        where t.id = p.task_id),
          'due_date', (select due_date from public.tasks where id = p.task_id),
          'body', p.body,
          'actor', (select coalesce(full_name, email) from public.profiles where id = p.actor_id),
          'created_at', p.created_at,
          'deliverable', (
            select jsonb_build_object('version', d.version, 'url', d.url, 'file_name', d.file_name, 'note', d.note)
            from public.deliverables d where d.task_id = p.task_id order by d.version desc limit 1
          )
        ) order by p.id)
      ) as mail
    from picked p
    group by p.recipient, p.request_id
  )
  select coalesce(jsonb_agg(mail), '[]') into v_out from grouped;

  return v_out;
end;
$$;
revoke execute on function public.notifications_claim(text) from public;
grant execute on function public.notifications_claim(text) to anon, authenticated;

-- Confirma el envio (p_error null) o libera para reintento
create or replace function public.notifications_ack(p_secret text, p_ids bigint[], p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.check_cron_secret(p_secret);
  if p_error is null then
    update public.notifications set sent_at = now(), last_error = null where id = any (p_ids);
  else
    update public.notifications set claimed_at = null, last_error = left(p_error, 500) where id = any (p_ids);
  end if;
end;
$$;
revoke execute on function public.notifications_ack(text, bigint[], text) from public;
grant execute on function public.notifications_ack(text, bigint[], text) to anon, authenticated;

-- Resumen diario para Tecnica: tareas abiertas vencidas, que vencen hoy o manana,
-- y las que llevan 2 dias o mas esperando informacion.
create or replace function public.tecnica_digest(p_secret text, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tasks jsonb;
begin
  perform public.check_cron_secret(p_secret);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', tt.name, 'due_date', t.due_date, 'status', t.status,
           'project', pr.name, 'client', pr.client,
           'assignee', coalesce(a.full_name, a.email),
           'bucket', case
             when t.status = 'falta_informacion' and t.updated_at < now() - interval '2 days' then 'esperando'
             when t.due_date < p_today then 'vencida'
             when t.due_date = p_today then 'hoy'
             else 'manana' end,
           'waiting_since', case when t.status = 'falta_informacion' then t.updated_at end
         ) order by t.due_date, pr.name), '[]')
  into v_tasks
  from public.tasks t
  join public.task_types tt on tt.id = t.task_type_id
  join public.requests r on r.id = t.request_id
  join public.projects pr on pr.id = r.project_id
  left join public.profiles a on a.id = t.assignee_id
  where t.status not in ('entregada', 'cancelada')
    and (t.due_date <= p_today + 1
         or (t.status = 'falta_informacion' and t.updated_at < now() - interval '2 days'));

  return jsonb_build_object(
    'today', p_today,
    'recipients', (select coalesce(jsonb_agg(email order by email), '[]') from public.profiles where role = 'tecnica'),
    'tasks', v_tasks
  );
end;
$$;
revoke execute on function public.tecnica_digest(text, date) from public;
grant execute on function public.tecnica_digest(text, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Disparadores para pg_cron: llaman a la app solo cuando hace falta
-- (app_url y cron_secret se cargan en app_config fuera de la migracion)
-- ---------------------------------------------------------------------------
create or replace function public.notifications_kick()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := public.app_config_get('app_url');
  v_secret text := public.app_config_get('cron_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  if not exists (
    select 1 from public.notifications
    where sent_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      and created_at < now() - interval '2 minutes'
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/api/cron/notificaciones',
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.notifications_kick() from public, anon, authenticated;

create or replace function public.digest_kick()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := public.app_config_get('app_url');
  v_secret text := public.app_config_get('cron_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/api/cron/resumen',
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.digest_kick() from public, anon, authenticated;

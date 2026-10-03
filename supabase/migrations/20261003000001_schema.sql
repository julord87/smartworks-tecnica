-- Tecnica Smartworks - esquema base
-- Tablas, tipos, helpers y triggers de negocio. Las politicas RLS van en la migracion siguiente.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('solicitante', 'tecnica');

create type public.task_status as enum (
  'recibida',
  'falta_informacion',
  'en_curso',
  'entregada',
  'cancelada'
);

create type public.attachment_kind as enum ('briefing', 'proposal', 'plano', 'render', 'otro');

create type public.task_event_kind as enum ('creacion', 'estado', 'comentario');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.user_role not null default 'solicitante',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  client      text not null check (length(trim(client)) > 0),
  event_date  date,
  venue       text,
  pm_id       uuid not null references public.profiles (id),
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index projects_pm_idx on public.projects (pm_id);
create index projects_created_by_idx on public.projects (created_by);

-- ---------------------------------------------------------------------------
-- task_types (catalogo editable)
-- ---------------------------------------------------------------------------
create table public.task_types (
  id            uuid primary key default gen_random_uuid(),
  position      int  not null default 0,
  name          text not null unique,
  description   text,
  needs         text not null default '',  -- que se necesita para empezar
  delivers      text not null default '',  -- que se entrega
  min_days      int  not null default 0 check (min_days >= 0),
  is_discovery  boolean not null default false,  -- "No se que necesito"
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
-- Solo puede haber un tipo "No se que necesito"
create unique index task_types_one_discovery on public.task_types (is_discovery) where is_discovery;

-- ---------------------------------------------------------------------------
-- requests (pedidos)
-- ---------------------------------------------------------------------------
create table public.requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  requested_by  uuid not null default auth.uid() references public.profiles (id),
  comment       text,
  created_at    timestamptz not null default now()
);
create index requests_project_idx on public.requests (project_id);
create index requests_requested_by_idx on public.requests (requested_by);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests (id) on delete cascade,
  task_type_id  uuid not null references public.task_types (id) on delete restrict,
  due_date      date not null,
  status        public.task_status not null default 'recibida',
  -- Texto que acompana el ultimo cambio de estado. Obligatorio al pasar a falta_informacion.
  status_note   text,
  notes         text,
  assignee_id   uuid references public.profiles (id),
  created_by    uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_request_idx on public.tasks (request_id);
create index tasks_status_due_idx on public.tasks (status, due_date);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- ---------------------------------------------------------------------------
-- attachments (adjuntos de quien pide; ligados a pedido o a tarea)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references public.requests (id) on delete cascade,
  task_id       uuid references public.tasks (id) on delete cascade,
  kind          public.attachment_kind not null default 'otro',
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  constraint attachments_one_parent check ((request_id is null) <> (task_id is null))
);
create index attachments_request_idx on public.attachments (request_id);
create index attachments_task_idx on public.attachments (task_id);

-- ---------------------------------------------------------------------------
-- deliverables (entregables de Tecnica, versionados por tarea)
-- ---------------------------------------------------------------------------
create table public.deliverables (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  version       int  not null,
  storage_path  text unique,
  url           text,
  file_name     text,
  note          text,
  uploaded_by   uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  constraint deliverables_file_or_link check ((storage_path is null) <> (url is null)),
  constraint deliverables_url_http check (url is null or url ~* '^https?://'),
  unique (task_id, version)
);

-- ---------------------------------------------------------------------------
-- task_events (historial inmutable)
-- ---------------------------------------------------------------------------
create table public.task_events (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  author_id    uuid references public.profiles (id),
  kind         public.task_event_kind not null,
  from_status  public.task_status,
  to_status    public.task_status,
  body         text,
  created_at   timestamptz not null default now(),
  constraint task_events_comment_body check (kind <> 'comentario' or length(trim(coalesce(body, ''))) > 0)
);
create index task_events_task_idx on public.task_events (task_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers de permisos (security definer: evitan recursion de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_tecnica()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'tecnica'
  );
$$;

-- Miembro de un proyecto: Tecnica, el PM, quien lo creo o quien tiene algun pedido en el.
-- Lectura: abierta a todo usuario autenticado. Escritura (adjuntos, comentarios, archivos): solo miembros.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_tecnica()
    or exists (
      select 1 from public.projects pr
      where pr.id = p_project_id
        and (pr.pm_id = auth.uid() or pr.created_by = auth.uid())
    )
    or exists (
      select 1 from public.requests r
      where r.project_id = p_project_id and r.requested_by = auth.uid()
    );
$$;

create or replace function public.request_project_id(p_request_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select project_id from public.requests where id = p_request_id;
$$;

create or replace function public.task_project_id(p_task_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select r.project_id
  from public.tasks t join public.requests r on r.id = t.request_id
  where t.id = p_task_id;
$$;

-- True si el pedido incluye una tarea "No se que necesito" (habilita a Tecnica a crear tareas en el)
create or replace function public.request_has_discovery(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t join public.task_types tt on tt.id = t.task_type_id
    where t.request_id = p_request_id and tt.is_discovery
  );
$$;

-- ---------------------------------------------------------------------------
-- allowed_emails: correos externos (sin @smartworks.es) con acceso permitido
-- ---------------------------------------------------------------------------
create table public.allowed_emails (
  email       text primary key check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note        text,
  added_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.is_email_allowed(p_email text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select lower(trim(p_email)) ~ '^[^@\s]+@smartworks\.es$'
    or exists (select 1 from public.allowed_emails a where a.email = lower(trim(p_email)));
$$;

-- ---------------------------------------------------------------------------
-- Alta de usuario: solo @smartworks.es o allowlist, perfil con rol solicitante
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or not public.is_email_allowed(new.email) then
    raise exception 'Correo no autorizado';
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie se cambia el rol a si mismo; solo Tecnica cambia roles. Email no editable.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- service role / migraciones
  end if;
  if new.role is distinct from old.role and not public.is_tecnica() then
    raise exception 'Solo Tecnica puede cambiar roles';
  end if;
  if new.email is distinct from old.email then
    raise exception 'El email no se puede modificar';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Tareas: reglas de estado + historial automatico
-- ---------------------------------------------------------------------------
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.profiles p where p.id = new.assignee_id and p.role = 'tecnica') then
    raise exception 'El responsable tiene que ser de Tecnica';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'recibida';
    new.status_note := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.request_id is distinct from old.request_id
     or new.task_type_id is distinct from old.task_type_id
     or new.created_by is distinct from old.created_by then
    raise exception 'No se puede mover una tarea de pedido ni cambiar su tipo';
  end if;

  if new.status is distinct from old.status then
    -- la nota de un estado anterior no se arrastra al nuevo
    if new.status_note is not distinct from old.status_note then
      new.status_note := null;
    end if;
    if new.status = 'falta_informacion' and length(trim(coalesce(new.status_note, ''))) = 0 then
      raise exception 'Al pasar a "falta informacion" hay que indicar que falta';
    end if;
  elsif new.status_note is distinct from old.status_note then
    -- status_note solo cambia junto con el estado
    new.status_note := old.status_note;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

create or replace function public.tasks_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, author_id, kind, to_status)
    values (new.id, auth.uid(), 'creacion', new.status);
  elsif new.status is distinct from old.status then
    insert into public.task_events (task_id, author_id, kind, from_status, to_status, body)
    values (new.id, auth.uid(), 'estado', old.status, new.status, nullif(trim(new.status_note), ''));
  end if;
  return null;
end;
$$;

create trigger tasks_after_write
  after insert or update on public.tasks
  for each row execute function public.tasks_after_write();

-- ---------------------------------------------------------------------------
-- Entregables: version correlativa por tarea
-- ---------------------------------------------------------------------------
create or replace function public.deliverables_set_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.tasks where id = new.task_id for update;
  select coalesce(max(version), 0) + 1 into new.version
  from public.deliverables where task_id = new.task_id;
  return new;
end;
$$;

create trigger deliverables_set_version
  before insert on public.deliverables
  for each row execute function public.deliverables_set_version();

-- Vista de bandeja: tarea + pedido + proyecto + tipo, con dias restantes.
-- security_invoker: respeta el RLS de quien consulta.
create view public.task_inbox
with (security_invoker = true)
as
select
  t.id,
  t.status,
  t.due_date,
  (t.due_date - current_date) as days_left,
  t.notes,
  t.assignee_id,
  t.created_at,
  t.updated_at,
  tt.id   as task_type_id,
  tt.name as task_type_name,
  tt.min_days,
  r.id    as request_id,
  r.requested_by,
  p.id    as project_id,
  p.name  as project_name,
  p.client,
  p.event_date
from public.tasks t
join public.task_types tt on tt.id = t.task_type_id
join public.requests r on r.id = t.request_id
join public.projects p on p.id = r.project_id;

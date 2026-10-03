-- Tecnica Smartworks - Row Level Security
-- Lectura: todo usuario autenticado ve proyectos, pedidos, tareas, adjuntos, entregables e historial.
-- Escritura: restringida por rol (Tecnica) y por pertenencia al proyecto (is_project_member).

alter table public.profiles     enable row level security;
alter table public.projects     enable row level security;
alter table public.task_types   enable row level security;
alter table public.requests     enable row level security;
alter table public.tasks        enable row level security;
alter table public.attachments  enable row level security;
alter table public.deliverables enable row level security;
alter table public.task_events  enable row level security;
alter table public.allowed_emails enable row level security;

-- Sin acceso anonimo a nada
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles: directorio interno legible por cualquier usuario logueado
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_tecnica())
  with check (id = auth.uid() or public.is_tecnica());
-- (cambio de rol y email bloqueados por trigger profiles_guard)

-- ---------------------------------------------------------------------------
-- allowed_emails: solo Tecnica
-- ---------------------------------------------------------------------------
create policy allowed_emails_tecnica on public.allowed_emails
  for all to authenticated
  using (public.is_tecnica()) with check (public.is_tecnica());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects
  for select to authenticated using (true);

create policy projects_insert on public.projects
  for insert to authenticated
  with check (created_by = auth.uid());

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_tecnica() or pm_id = auth.uid() or created_by = auth.uid())
  with check (public.is_tecnica() or pm_id = auth.uid() or created_by = auth.uid());

create policy projects_delete on public.projects
  for delete to authenticated using (public.is_tecnica());

-- ---------------------------------------------------------------------------
-- task_types: todos leen, solo Tecnica edita
-- ---------------------------------------------------------------------------
create policy task_types_select on public.task_types
  for select to authenticated using (true);

create policy task_types_write on public.task_types
  for all to authenticated
  using (public.is_tecnica()) with check (public.is_tecnica());

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
create policy requests_select on public.requests
  for select to authenticated using (true);

-- Cualquier usuario puede pedir trabajo sobre cualquier proyecto (y pasa a ser miembro)
create policy requests_insert on public.requests
  for insert to authenticated
  with check (requested_by = auth.uid());

create policy requests_update on public.requests
  for update to authenticated
  using (requested_by = auth.uid() or public.is_tecnica())
  with check (requested_by = auth.uid() or public.is_tecnica());

create policy requests_delete on public.requests
  for delete to authenticated using (public.is_tecnica());

-- ---------------------------------------------------------------------------
-- tasks
-- Alta: el solicitante en sus propios pedidos; Tecnica solo en pedidos con "No se que necesito".
-- Edicion (estado, responsable, notas, fecha): solo Tecnica.
-- ---------------------------------------------------------------------------
create policy tasks_select on public.tasks
  for select to authenticated using (true);

create policy tasks_insert_solicitante on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.requested_by = auth.uid()
    )
  );

create policy tasks_insert_tecnica on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_tecnica()
    and public.request_has_discovery(request_id)
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_tecnica()) with check (public.is_tecnica());
-- Sin delete: las tareas se cancelan, no se borran.

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
create policy attachments_select on public.attachments
  for select to authenticated using (true);

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_project_member(
      coalesce(public.request_project_id(request_id), public.task_project_id(task_id))
    )
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_tecnica());

-- ---------------------------------------------------------------------------
-- deliverables: todos leen; solo Tecnica sube
-- ---------------------------------------------------------------------------
create policy deliverables_select on public.deliverables
  for select to authenticated using (true);

create policy deliverables_insert on public.deliverables
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_tecnica());

create policy deliverables_delete on public.deliverables
  for delete to authenticated using (public.is_tecnica());

-- ---------------------------------------------------------------------------
-- task_events: historial inmutable. Los usuarios solo insertan comentarios;
-- creacion y cambios de estado los escribe el trigger de tasks.
-- ---------------------------------------------------------------------------
create policy task_events_select on public.task_events
  for select to authenticated using (true);

create policy task_events_insert_comment on public.task_events
  for insert to authenticated
  with check (
    kind = 'comentario'
    and author_id = auth.uid()
    and from_status is null and to_status is null
    and public.is_project_member(public.task_project_id(task_id))
  );
-- Sin update ni delete.

-- is_email_allowed revelaria quien esta en la allowlist: solo lo usa el trigger de alta.
revoke execute on function public.is_email_allowed(text) from public, anon, authenticated;

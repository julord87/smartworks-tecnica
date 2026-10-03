-- Tecnica Smartworks - varios PM por proyecto
-- project_managers es la fuente de verdad. projects.pm_id queda como "PM principal" (uno de la lista),
-- lo mantienen los triggers de abajo.
-- Editan el proyecto y su lista de PM: Tecnica, quien lo creo y cualquiera de sus PM.

create table public.project_managers (
  project_id  uuid not null references public.projects (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  added_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_managers_profile_idx on public.project_managers (profile_id);

insert into public.project_managers (project_id, profile_id, added_by)
select id, pm_id, created_by from public.projects
on conflict do nothing;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_tecnica()
    or exists (select 1 from public.projects pr where pr.id = p_project_id and pr.created_by = auth.uid())
    or exists (select 1 from public.project_managers m where m.project_id = p_project_id and m.profile_id = auth.uid());
$$;
revoke execute on function public.can_edit_project(uuid) from public, anon;
grant execute on function public.can_edit_project(uuid) to authenticated;

-- Miembro de un proyecto: ahora incluye a todos sus PM
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_edit_project(p_project_id)
    or exists (
      select 1 from public.requests r
      where r.project_id = p_project_id and r.requested_by = auth.uid()
    );
$$;

alter policy projects_update on public.projects
  using (public.can_edit_project(id))
  with check (public.can_edit_project(id));

alter table public.project_managers enable row level security;

create policy project_managers_select on public.project_managers
  for select to authenticated using (true);

create policy project_managers_insert on public.project_managers
  for insert to authenticated
  with check (public.can_edit_project(project_id));

create policy project_managers_delete on public.project_managers
  for delete to authenticated
  using (public.can_edit_project(project_id));

-- El PM principal siempre esta en la lista
create or replace function public.project_pm_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.project_managers (project_id, profile_id)
  values (new.id, new.pm_id)
  on conflict do nothing;
  return null;
end;
$$;

create trigger project_pm_sync
  after insert or update of pm_id on public.projects
  for each row execute function public.project_pm_sync();

-- Al quitar un PM: el proyecto no puede quedar sin PM; si era el principal, pasa a otro de la lista
create or replace function public.project_managers_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  if not exists (select 1 from public.projects where id = old.project_id) then
    return null; -- borrado del proyecto en cascada
  end if;
  select profile_id into v_next from public.project_managers
  where project_id = old.project_id
  order by created_at, profile_id
  limit 1;
  if v_next is null then
    raise exception 'El proyecto necesita al menos un PM';
  end if;
  update public.projects set pm_id = v_next
  where id = old.project_id and pm_id = old.profile_id;
  return null;
end;
$$;

create trigger project_managers_after_delete
  after delete on public.project_managers
  for each row execute function public.project_managers_after_delete();

revoke execute on function public.project_pm_sync() from public, anon, authenticated;
revoke execute on function public.project_managers_after_delete() from public, anon, authenticated;

-- Avisos: a todos los PM del proyecto
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
    -- Solicitante, PMs y copias: cambios de estado que les importan
    select p.email, 'solicitante', 1
    from public.requests r join public.profiles p on p.id = r.requested_by
    where p_kind in ('falta_informacion', 'entregada', 'cancelada') and r.id = p_request_id
    union all
    select p.email, 'pm', 2
    from public.requests r
    join public.project_managers m on m.project_id = r.project_id
    join public.profiles p on p.id = m.profile_id
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

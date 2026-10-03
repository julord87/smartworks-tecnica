-- Tecnica Smartworks - alta de pedido en una sola transaccion
-- security invoker: corre con el rol de quien llama, asi que aplican todas las politicas RLS.
--
-- p_project_id   proyecto existente, o null si se crea uno nuevo
-- p_new_project  {"name","client","event_date","venue","pm_id"} cuando p_project_id es null
-- p_comment      comentario general del pedido
-- p_tasks        [{"task_type_id","due_date","notes"}], al menos una
--
-- Devuelve {"project_id","request_id"}.

create or replace function public.create_request(
  p_project_id uuid,
  p_new_project jsonb,
  p_comment text,
  p_tasks jsonb
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

    insert into public.projects (name, client, event_date, venue, pm_id, created_by)
    values (
      trim(p_new_project ->> 'name'),
      trim(p_new_project ->> 'client'),
      nullif(p_new_project ->> 'event_date', '')::date,
      nullif(trim(coalesce(p_new_project ->> 'venue', '')), ''),
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

  return jsonb_build_object('project_id', v_project_id, 'request_id', v_request_id);
end;
$$;

revoke execute on function public.create_request(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_request(uuid, jsonb, text, jsonb) to authenticated;

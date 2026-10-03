-- Tecnica Smartworks - permisos de ejecucion de funciones
-- Supabase expone las funciones de public como RPC. Los triggers no se llaman a mano,
-- y los helpers de RLS solo los necesita el rol authenticated (las politicas se evaluan con su rol).

revoke execute on function
  public.handle_new_user(),
  public.guard_profile_update(),
  public.tasks_before_write(),
  public.tasks_after_write(),
  public.deliverables_set_version()
from public, anon, authenticated;

revoke execute on function
  public.is_tecnica(),
  public.is_project_member(uuid),
  public.request_project_id(uuid),
  public.task_project_id(uuid),
  public.request_has_discovery(uuid),
  public.storage_project_id(text)
from public, anon;

grant execute on function
  public.is_tecnica(),
  public.is_project_member(uuid),
  public.request_project_id(uuid),
  public.task_project_id(uuid),
  public.request_has_discovery(uuid),
  public.storage_project_id(text)
to authenticated;

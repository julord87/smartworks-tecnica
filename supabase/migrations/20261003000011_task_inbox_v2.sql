-- Tecnica Smartworks - task_inbox con nota de estado y datos del proyecto
-- (columnas nuevas al final: create or replace view lo permite sin DROP)
create or replace view public.task_inbox
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
  p.event_date,
  t.status_note,
  p.venue,
  p.supplier,
  p.pm_id,
  r.created_at as request_created_at,
  tt.position as task_type_position
from public.tasks t
join public.task_types tt on tt.id = t.task_type_id
join public.requests r on r.id = t.request_id
join public.projects p on p.id = r.project_id;

import type { TaskStatus } from "@/lib/domain";

// Fila de la vista public.task_inbox
export type InboxRow = {
  id: string;
  status: TaskStatus;
  due_date: string;
  days_left: number;
  notes: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  task_type_id: string;
  task_type_name: string;
  min_days: number;
  request_id: string;
  requested_by: string;
  project_id: string;
  project_name: string;
  client: string;
  event_date: string | null;
  status_note: string | null;
  venue: string | null;
  supplier: string | null;
  pm_id: string;
  request_created_at: string;
  task_type_position: number;
};

export const INBOX_COLUMNS =
  "id,status,due_date,days_left,notes,assignee_id,created_at,updated_at,task_type_id,task_type_name,min_days,request_id,requested_by,project_id,project_name,client,event_date,status_note,venue,supplier,pm_id,request_created_at,task_type_position";

export const OPEN_STATUSES: TaskStatus[] = ["recibida", "falta_informacion", "en_curso"];

export function isOpen(s: TaskStatus) {
  return OPEN_STATUSES.includes(s);
}

// Urgencia: abiertas primero; dentro, falta informacion arriba si vence igual, luego por fecha
export function byUrgency(a: InboxRow, b: InboxRow): number {
  const oa = isOpen(a.status) ? 0 : 1;
  const ob = isOpen(b.status) ? 0 : 1;
  if (oa !== ob) return oa - ob;
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  const w = (s: TaskStatus) => (s === "falta_informacion" ? 0 : s === "recibida" ? 1 : 2);
  return w(a.status) - w(b.status);
}

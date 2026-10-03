import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/dates";
import { ATTACHMENT_KINDS, STATUS_LABELS, personLabel, type PersonOption, type TaskStatus } from "@/lib/domain";
import { INBOX_COLUMNS, isOpen, type InboxRow } from "@/lib/inbox";
import { StatusBadge } from "@/components/status-badge";
import { DueLabel } from "@/components/due-label";
import { fileHref } from "@/lib/files";
import { AddTasksPanel, AssignPanel, DeliverablePanel, ReplyPanel, StatusPanel } from "./task-panels";

export const metadata = { title: "Tarea · Técnica Smartworks" };

type Attachment = { id: string; request_id: string | null; task_id: string | null; kind: string; storage_path: string; file_name: string; uploaded_by: string; created_at: string };
type Deliverable = { id: string; version: number; url: string | null; storage_path: string | null; file_name: string | null; note: string | null; uploaded_by: string; created_at: string };
type TaskEvent = { id: string; author_id: string | null; kind: "creacion" | "estado" | "comentario"; from_status: TaskStatus | null; to_status: TaskStatus | null; body: string | null; created_at: string };

const KIND_LABEL = Object.fromEntries(ATTACHMENT_KINDS.map((k) => [k.value, k.label]));
const UUID_RE = /^[0-9a-f-]{36}$/i;

function when(ts: string) {
  const d = new Date(ts);
  return `${shortDate(ts.slice(0, 10))} ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}`;
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: task } = await supabase.from("task_inbox").select(INBOX_COLUMNS).eq("id", id).maybeSingle<InboxRow>();
  if (!task) notFound();

  const [type, request, attachments, deliverables, events, people, watchers, siblings, pms] = await Promise.all([
    supabase.from("task_types").select("needs, delivers, is_discovery").eq("id", task.task_type_id).single(),
    supabase.from("requests").select("comment").eq("id", task.request_id).single(),
    supabase.from("attachments").select("*").or(`request_id.eq.${task.request_id},task_id.eq.${task.id}`).order("created_at"),
    supabase.from("deliverables").select("*").eq("task_id", task.id).order("version", { ascending: false }),
    supabase.from("task_events").select("*").eq("task_id", task.id).order("created_at"),
    supabase.from("profiles").select("id, full_name, email, role"),
    supabase.from("request_watchers").select("email").eq("request_id", task.request_id),
    supabase.from("task_inbox").select("id, task_type_name, status, due_date").eq("request_id", task.request_id).neq("id", task.id),
    supabase.from("project_managers").select("profile_id").eq("project_id", task.project_id).order("created_at"),
  ]);

  const persons = (people.data ?? []) as (PersonOption & { role: string })[];
  const name = (pid: string | null) => (pid ? (persons.find((p) => p.id === pid) ? personLabel(persons.find((p) => p.id === pid)!) : "") : "");
  const isTecnica = profile.role === "tecnica";
  const files = (attachments.data ?? []) as Attachment[];
  const delivs = (deliverables.data ?? []) as Deliverable[];
  const history = (events.data ?? []) as TaskEvent[];
  const isDiscovery = Boolean(type.data?.is_discovery);
  const open = isOpen(task.status);

  let addableTypes: { id: string; name: string; min_days: number }[] = [];
  if (isTecnica && isDiscovery) {
    const { data } = await supabase.from("task_types").select("id, name, min_days").eq("active", true).eq("is_discovery", false).order("position");
    addableTypes = data ?? [];
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <nav className="text-sm text-muted">
        <Link href={`/proyectos/${task.project_id}`} className="text-sw-blue underline-offset-4 hover:underline">
          {task.project_name}
        </Link>{" "}
        · {task.client}
      </nav>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">{task.task_type_name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={task.status} />
        <DueLabel due={task.due_date} daysLeft={task.days_left} open={open} />
      </div>

      {task.status === "falta_informacion" && task.status_note && (
        <div className="mt-6 border-l-4 border-sw-red bg-panel px-4 py-3">
          <p className="text-sm font-bold text-st-falta uppercase">Técnica necesita</p>
          <p className="mt-1 whitespace-pre-line">{task.status_note}</p>
        </div>
      )}
      {task.status === "cancelada" && task.status_note && (
        <p className="mt-6 border-l-4 border-line bg-panel px-4 py-3 text-sm">Motivo: {task.status_note}</p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          {/* Entregables */}
          <section aria-labelledby="s-entregables">
            <h2 id="s-entregables" className="mb-2 text-sm font-bold uppercase tracking-wide text-sw-blue">
              Entregables
            </h2>
            {delivs.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay entregables.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {delivs.map((d, i) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span className="min-w-0">
                      <a
                        href={d.url ?? fileHref(d.storage_path!, d.file_name ?? "entregable")}
                        target={d.url ? "_blank" : undefined}
                        rel="noreferrer"
                        className="font-semibold text-sw-blue underline-offset-4 hover:underline"
                      >
                        {d.file_name ?? (d.url ? "Enlace" : "Archivo")}
                      </a>
                      <span className="ml-2 text-xs font-bold text-muted">v{d.version}</span>
                      {i === 0 && delivs.length > 1 && <span className="ml-2 text-xs font-bold text-st-entregada">ÚLTIMA</span>}
                      {d.note && <span className="block text-sm text-muted">{d.note}</span>}
                    </span>
                    <span className="text-xs text-muted">
                      {name(d.uploaded_by)} · {when(d.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isTecnica && (
            <>
              <StatusPanel taskId={task.id} current={task.status} hasDeliverable={delivs.length > 0} />
              <DeliverablePanel taskId={task.id} projectId={task.project_id} nextVersion={(delivs[0]?.version ?? 0) + 1} />
              {isDiscovery && addableTypes.length > 0 && (
                <AddTasksPanel taskId={task.id} requestId={task.request_id} types={addableTypes} />
              )}
            </>
          )}

          <ReplyPanel taskId={task.id} projectId={task.project_id} waitingInfo={task.status === "falta_informacion" && !isTecnica} />

          {/* Historial */}
          <section aria-labelledby="s-historial">
            <h2 id="s-historial" className="mb-2 text-sm font-bold uppercase tracking-wide text-sw-blue">
              Historial
            </h2>
            <ol className="border-l-2 border-line pl-4">
              {[...history].reverse().map((e) => (
                <li key={e.id} className="relative pb-4">
                  <span className="absolute top-1.5 -left-[1.4rem] size-2.5 bg-sw-blue" aria-hidden />
                  <p className="text-xs text-muted">
                    {when(e.created_at)} · {name(e.author_id) || "Sistema"}
                  </p>
                  {e.kind === "creacion" && <p className="text-sm">Tarea creada.</p>}
                  {e.kind === "estado" && (
                    <p className="text-sm">
                      {e.from_status ? STATUS_LABELS[e.from_status] : ""} → <strong>{e.to_status ? STATUS_LABELS[e.to_status] : ""}</strong>
                    </p>
                  )}
                  {e.body && <p className="mt-1 text-sm whitespace-pre-line">{e.body}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="grid content-start gap-6">
          {isTecnica && (
            <AssignPanel
              taskId={task.id}
              assigneeId={task.assignee_id}
              due={task.due_date}
              people={persons.filter((p) => p.role === "tecnica").map((p) => ({ id: p.id, label: personLabel(p) }))}
            />
          )}

          <section aria-labelledby="s-datos" className="border border-line p-4">
            <h2 id="s-datos" className="mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue">
              Datos
            </h2>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Pide</dt>
              <dd>{name(task.requested_by)}</dd>
              <dt className="text-muted">Pedido</dt>
              <dd>{shortDate(task.request_created_at)}</dd>
              <dt className="text-muted">Responsable</dt>
              <dd>{name(task.assignee_id) || <span className="text-muted">Sin asignar</span>}</dd>
              <dt className="text-muted">{(pms.data?.length ?? 0) > 1 ? "PMs" : "PM"}</dt>
              <dd>{(pms.data ?? []).map((m) => name(m.profile_id as string)).join(", ")}</dd>
              {task.event_date && (
                <>
                  <dt className="text-muted">Evento</dt>
                  <dd>{shortDate(task.event_date)}</dd>
                </>
              )}
              {task.venue && (
                <>
                  <dt className="text-muted">Venue</dt>
                  <dd>{task.venue}</dd>
                </>
              )}
              {task.supplier && (
                <>
                  <dt className="text-muted">Proveedor</dt>
                  <dd>{task.supplier}</dd>
                </>
              )}
              {(watchers.data ?? []).length > 0 && (
                <>
                  <dt className="text-muted">En copia</dt>
                  <dd className="break-all">{(watchers.data ?? []).map((w) => w.email).join(", ")}</dd>
                </>
              )}
            </dl>
            {task.notes && (
              <p className="mt-3 border-t border-line pt-3 text-sm">
                <span className="font-semibold">Notas: </span>
                {task.notes}
              </p>
            )}
            {request.data?.comment && (
              <p className="mt-3 border-t border-line pt-3 text-sm whitespace-pre-line">
                <span className="font-semibold">Comentario del pedido: </span>
                {request.data.comment}
              </p>
            )}
          </section>

          <section aria-labelledby="s-tipo" className="border border-line p-4 text-sm">
            <h2 id="s-tipo" className="mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue">
              Esta tarea
            </h2>
            <p>
              <span className="font-semibold">Para empezar:</span> {type.data?.needs}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Entrega:</span> {type.data?.delivers}
            </p>
            <p className="mt-1 text-muted">Plazo mínimo: {task.min_days} días</p>
          </section>

          <section aria-labelledby="s-adjuntos" className="border border-line p-4">
            <h2 id="s-adjuntos" className="mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue">
              Adjuntos ({files.length})
            </h2>
            {files.length === 0 ? (
              <p className="text-sm text-muted">Sin adjuntos.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {files.map((f) => (
                  <li key={f.id}>
                    <a href={fileHref(f.storage_path, f.file_name)} className="font-semibold break-all text-sw-blue underline-offset-4 hover:underline">
                      {f.file_name}
                    </a>
                    <span className="block text-xs text-muted">
                      {KIND_LABEL[f.kind] ?? f.kind} · {f.task_id ? "de la tarea" : "del pedido"} · {name(f.uploaded_by)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(siblings.data ?? []).length > 0 && (
            <section aria-labelledby="s-pedido" className="border border-line p-4">
              <h2 id="s-pedido" className="mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue">
                Otras tareas del pedido
              </h2>
              <ul className="grid gap-2 text-sm">
                {(siblings.data ?? []).map((s) => (
                  <li key={s.id as string} className="flex items-center justify-between gap-2">
                    <Link href={`/tareas/${s.id}`} className="min-w-0 truncate text-sw-blue underline-offset-4 hover:underline">
                      {s.task_type_name as string}
                    </Link>
                    <StatusBadge status={s.status as TaskStatus} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/dates";
import { ATTACHMENT_KINDS, STATUS_LABELS, personLabel, type PersonOption, type TaskStatus } from "@/lib/domain";
import { INBOX_COLUMNS, isOpen, type InboxRow } from "@/lib/inbox";
import { fileHref } from "@/lib/files";
import { StatusBadge } from "@/components/status-badge";
import { DueLabel } from "@/components/due-label";
import { buttonClass } from "@/components/ui/button";
import { ProjectForm } from "./project-form";

export const metadata = { title: "Proyecto · Técnica Smartworks" };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const KIND_LABEL = Object.fromEntries(ATTACHMENT_KINDS.map((k) => [k.value, k.label]));
const TITLE = "mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue";

type Project = { id: string; name: string; client: string; event_date: string | null; venue: string | null; supplier: string | null; pm_id: string; created_by: string };
type Request = { id: string; requested_by: string; comment: string | null; created_at: string };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client, event_date, venue, supplier, pm_id, created_by")
    .eq("id", id)
    .maybeSingle<Project>();
  if (!project) notFound();

  const [{ data: tasksData }, { data: reqData }, { data: people }, { data: pmRows }] = await Promise.all([
    supabase.from("task_inbox").select(INBOX_COLUMNS).eq("project_id", id),
    supabase.from("requests").select("id, requested_by, comment, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("project_managers").select("profile_id").eq("project_id", id).order("created_at"),
  ]);
  const pmIds = (pmRows ?? []).map((m) => m.profile_id as string);
  const tasks = (tasksData ?? []) as InboxRow[];
  const requests = (reqData ?? []) as Request[];
  const persons = (people ?? []) as PersonOption[];
  const name = (pid: string | null) => {
    const p = persons.find((x) => x.id === pid);
    return p ? personLabel(p) : "";
  };

  const taskIds = tasks.map((t) => t.id);
  const requestIds = requests.map((r) => r.id);
  const ATT = "id, request_id, task_id, kind, storage_path, file_name, uploaded_by, created_at";
  const [reqAtts, taskAtts, delivs, events] = await Promise.all([
    requestIds.length ? supabase.from("attachments").select(ATT).in("request_id", requestIds) : Promise.resolve({ data: [] }),
    taskIds.length ? supabase.from("attachments").select(ATT).in("task_id", taskIds) : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("deliverables").select("id, task_id, version, url, storage_path, file_name, created_at").in("task_id", taskIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("task_events").select("id, task_id, author_id, kind, from_status, to_status, body, created_at").in("task_id", taskIds).order("created_at", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
  ]);
  const attachments = [...(reqAtts.data ?? []), ...(taskAtts.data ?? [])] as { id: string; task_id: string | null; kind: string; storage_path: string; file_name: string; uploaded_by: string; created_at: string }[];
  const deliverables = (delivs.data ?? []) as { id: string; task_id: string; version: number; url: string | null; storage_path: string | null; file_name: string | null; created_at: string }[];
  const history = (events.data ?? []) as { id: string; task_id: string; author_id: string | null; kind: string; from_status: TaskStatus | null; to_status: TaskStatus | null; body: string | null; created_at: string }[];
  const taskName = new Map(tasks.map((t) => [t.id, t.task_type_name]));

  const canEdit = profile.role === "tecnica" || pmIds.includes(profile.id) || project.created_by === profile.id;
  const openCount = tasks.filter((t) => isOpen(t.status)).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">{project.name}</h1>
          <p className="mt-1 text-lg text-muted">{project.client}</p>
        </div>
        <Link href={`/pedidos/nuevo?proyecto=${project.id}`} className={buttonClass("primary")}>
          Pedir algo para este proyecto
        </Link>
      </div>

      <section aria-label="Datos del proyecto" className="mt-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Evento</dt>
            <dd className="font-semibold">{project.event_date ? shortDate(project.event_date) : "Sin fecha"}</dd>
          </div>
          <div>
            <dt className="text-muted">Venue</dt>
            <dd className="font-semibold">{project.venue ?? "Sin definir"}</dd>
          </div>
          <div>
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">{project.supplier ?? "Sin definir"}</dd>
          </div>
          <div>
            <dt className="text-muted">{pmIds.length > 1 ? "PMs" : "PM"}</dt>
            <dd className="font-semibold">{pmIds.map(name).join(", ")}</dd>
          </div>
        </dl>
        {canEdit && (
          <div className="mt-4">
            <ProjectForm
              id={project.id}
              initial={{
                name: project.name,
                client: project.client,
                event_date: project.event_date ?? "",
                venue: project.venue ?? "",
                supplier: project.supplier ?? "",
                pm_ids: pmIds,
              }}
              people={persons}
              currentUserId={profile.id}
            />
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="s-tareas">
          <h2 id="s-tareas" className={TITLE}>
            Tareas ({openCount} abiertas de {tasks.length})
          </h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay pedidos en este proyecto.</p>
          ) : (
            <div className="grid gap-5">
              {requests.map((r) => (
                <div key={r.id} className="border border-line">
                  <p className="border-b border-line bg-zebra px-4 py-2 text-sm text-muted">
                    Pedido {shortDate(r.created_at)} por <span className="font-semibold text-ink">{name(r.requested_by)}</span>
                    {r.comment && <span className="mt-1 block whitespace-pre-line text-ink">{r.comment}</span>}
                  </p>
                  <ul className="divide-y divide-line">
                    {tasks
                      .filter((t) => t.request_id === r.id)
                      .sort((a, b) => a.task_type_position - b.task_type_position)
                      .map((t) => (
                        <li key={t.id}>
                          <Link href={`/tareas/${t.id}`} className="grid gap-1 px-4 py-3 hover:bg-panel sm:grid-cols-[1fr_auto] sm:items-center">
                            <span className="font-semibold">{t.task_type_name}</span>
                            <span className="flex flex-wrap items-center gap-3 text-sm">
                              <StatusBadge status={t.status} />
                              <DueLabel due={t.due_date} daysLeft={t.days_left} open={isOpen(t.status)} />
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <h2 className={`${TITLE} mt-10`}>Historial</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">Sin movimientos.</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line text-sm">
              {history.map((e) => (
                <li key={e.id} className="py-2">
                  <span className="text-xs text-muted">
                    {shortDate(e.created_at)} · {name(e.author_id) || "Sistema"} ·{" "}
                    <Link href={`/tareas/${e.task_id}`} className="underline-offset-4 hover:underline">
                      {taskName.get(e.task_id)}
                    </Link>
                  </span>
                  <span className="block">
                    {e.kind === "creacion" && "Tarea creada."}
                    {e.kind === "estado" && (
                      <>
                        {e.from_status ? STATUS_LABELS[e.from_status] : ""} → <strong>{e.to_status ? STATUS_LABELS[e.to_status] : ""}</strong>
                      </>
                    )}
                    {e.body && <span className="block whitespace-pre-line text-muted">{e.body}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="grid content-start gap-8">
          <section aria-labelledby="s-entregables">
            <h2 id="s-entregables" className={TITLE}>
              Entregables ({deliverables.length})
            </h2>
            {deliverables.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay entregables.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {deliverables.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.url ?? fileHref(d.storage_path!, d.file_name ?? "entregable")}
                      target={d.url ? "_blank" : undefined}
                      rel="noreferrer"
                      className="font-semibold break-all text-sw-blue underline-offset-4 hover:underline"
                    >
                      {d.file_name ?? "Entregable"}
                    </a>{" "}
                    <span className="text-xs font-bold text-muted">v{d.version}</span>
                    <span className="block text-xs text-muted">{taskName.get(d.task_id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="s-adjuntos">
            <h2 id="s-adjuntos" className={TITLE}>
              Adjuntos ({attachments.length})
            </h2>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted">Sin adjuntos.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <a href={fileHref(a.storage_path, a.file_name)} className="font-semibold break-all text-sw-blue underline-offset-4 hover:underline">
                      {a.file_name}
                    </a>
                    <span className="block text-xs text-muted">
                      {KIND_LABEL[a.kind] ?? a.kind} · {a.task_id ? taskName.get(a.task_id) : "pedido"} · {name(a.uploaded_by)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

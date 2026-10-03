import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/dates";
import { personLabel, type PersonOption } from "@/lib/domain";
import { INBOX_COLUMNS, isOpen, type InboxRow } from "@/lib/inbox";
import { StatusBadge } from "@/components/status-badge";
import { DueLabel } from "@/components/due-label";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Mis pedidos · Técnica Smartworks" };

type RequestGroup = {
  id: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  client: string;
  eventDate: string | null;
  requestedBy: string;
  tasks: InboxRow[];
};

export default async function MyRequestsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Pedidos propios y los de proyectos donde soy PM
  const [{ data: mine }, { data: pmProjects }, { data: people }] = await Promise.all([
    supabase.from("requests").select("id").eq("requested_by", profile.id),
    supabase.from("project_managers").select("project_id").eq("profile_id", profile.id),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const projectIds = (pmProjects ?? []).map((p) => p.project_id as string);
  const { data: fromProjects } = projectIds.length
    ? await supabase.from("requests").select("id").in("project_id", projectIds)
    : { data: [] as { id: string }[] };

  const requestIds = [...new Set([...(mine ?? []), ...(fromProjects ?? [])].map((r) => r.id as string))];
  const { data: rows } = requestIds.length
    ? await supabase.from("task_inbox").select(INBOX_COLUMNS).in("request_id", requestIds)
    : { data: [] as InboxRow[] };

  const names = new Map((people as PersonOption[] | null)?.map((p) => [p.id, personLabel(p)]) ?? []);
  const groups = new Map<string, RequestGroup>();
  for (const t of (rows ?? []) as InboxRow[]) {
    const g = groups.get(t.request_id) ?? {
      id: t.request_id,
      createdAt: t.request_created_at,
      projectId: t.project_id,
      projectName: t.project_name,
      client: t.client,
      eventDate: t.event_date,
      requestedBy: t.requested_by,
      tasks: [],
    };
    g.tasks.push(t);
    groups.set(t.request_id, g);
  }

  // Primero lo que necesita respuesta, despues lo abierto, despues lo cerrado; dentro, lo mas reciente
  const rank = (g: RequestGroup) =>
    g.tasks.some((t) => t.status === "falta_informacion") ? 0 : g.tasks.some((t) => isOpen(t.status)) ? 1 : 2;
  const list = [...groups.values()]
    .map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => a.task_type_position - b.task_type_position) }))
    .sort((a, b) => rank(a) - rank(b) || (a.createdAt < b.createdAt ? 1 : -1));

  const waiting = list.flatMap((g) => g.tasks).filter((t) => t.status === "falta_informacion").length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Mis pedidos</h1>
          <p className="mt-2 text-muted">Tus pedidos y los de los proyectos donde eres PM.</p>
        </div>
        <Link href="/pedidos/nuevo" className={buttonClass("primary")}>
          Nuevo pedido
        </Link>
      </div>

      {waiting > 0 && (
        <p className="mt-6 flex gap-2 border-l-4 border-sw-red bg-panel px-4 py-3 text-sm" role="status">
          <WarningCircle size={20} weight="bold" className="shrink-0 text-sw-red" />
          <span>
            <strong>
              {waiting} {waiting === 1 ? "tarea espera" : "tareas esperan"} información tuya.
            </strong>{" "}
            Técnica no puede seguir hasta que respondas.
          </span>
        </p>
      )}

      {list.length === 0 ? (
        <div className="mt-10 border border-line px-6 py-10">
          <p className="text-lg font-bold">Todavía no hay pedidos</p>
          <p className="mt-1 max-w-[50ch] text-muted">
            Cuando pidas algo a Técnica, aquí verás cada tarea con su estado y su fecha límite.
          </p>
          <Link href="/pedidos/nuevo" className={buttonClass("primary", "mt-6")}>
            Hacer el primer pedido
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          {list.map((g) => (
            <section key={g.id} className="border border-line" aria-label={`Pedido de ${g.projectName}`}>
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-zebra px-4 py-3">
                <h2 className="font-bold">
                  <Link href={`/proyectos/${g.projectId}`} className="underline-offset-4 hover:underline">
                    {g.projectName}
                  </Link>{" "}
                  <span className="font-normal text-muted">· {g.client}</span>
                </h2>
                <p className="text-sm text-muted">
                  Pedido {shortDate(g.createdAt.slice(0, 10))}
                  {g.requestedBy !== profile.id && ` por ${names.get(g.requestedBy) ?? "otra persona"}`}
                  {g.eventDate && ` · evento ${shortDate(g.eventDate)}`}
                </p>
              </header>
              <ul className="divide-y divide-line">
                {g.tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tareas/${t.id}`}
                      className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-panel sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{t.task_type_name}</span>
                        {t.status === "falta_informacion" && t.status_note && (
                          <span className="mt-1 block text-sm">
                            <span className="font-semibold text-st-falta">Técnica necesita: </span>
                            {t.status_note}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-3 text-sm sm:justify-end">
                        <StatusBadge status={t.status} />
                        <DueLabel due={t.due_date} daysLeft={t.days_left} open={isOpen(t.status)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

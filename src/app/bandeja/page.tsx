import Link from "next/link";
import { requireTecnica } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { personLabel, type PersonOption, type TaskStatus } from "@/lib/domain";
import { INBOX_COLUMNS, OPEN_STATUSES, byUrgency, isOpen, type InboxRow } from "@/lib/inbox";
import { StatusBadge } from "@/components/status-badge";
import { DueLabel } from "@/components/due-label";
import { Filters } from "./filters";

export const metadata = { title: "Bandeja · Técnica Smartworks" };

type Search = { estado?: string; vence?: string; proyecto?: string; responsable?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const profile = await requireTecnica();
  const f = await searchParams;
  const supabase = await createClient();

  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("task_inbox").select(INBOX_COLUMNS),
    supabase.from("profiles").select("id, full_name, email, role"),
  ]);
  const all = (rows ?? []) as InboxRow[];
  const persons = (people ?? []) as (PersonOption & { role: string })[];
  const names = new Map(persons.map((p) => [p.id, personLabel(p)]));

  const open = all.filter((t) => isOpen(t.status));
  const counts = {
    vencidas: open.filter((t) => t.days_left < 0).length,
    hoy: open.filter((t) => t.days_left === 0).length,
    semana: open.filter((t) => t.days_left >= 0 && t.days_left <= 7).length,
    falta: open.filter((t) => t.status === "falta_informacion").length,
    sinResponsable: open.filter((t) => !t.assignee_id).length,
  };

  // Filtros
  let list = all;
  if (!f.estado) list = list.filter((t) => isOpen(t.status));
  else if (f.estado !== "todas") list = list.filter((t) => t.status === (f.estado as TaskStatus));
  if (f.vence === "vencidas") list = list.filter((t) => t.days_left < 0);
  if (f.vence === "hoy") list = list.filter((t) => t.days_left <= 0);
  if (f.vence === "semana") list = list.filter((t) => t.days_left <= 7);
  if (f.vence === "mes") list = list.filter((t) => t.days_left <= 30);
  if (f.proyecto) list = list.filter((t) => t.project_id === f.proyecto);
  if (f.responsable === "yo") list = list.filter((t) => t.assignee_id === profile.id);
  else if (f.responsable === "sin") list = list.filter((t) => !t.assignee_id);
  else if (f.responsable) list = list.filter((t) => t.assignee_id === f.responsable);
  list = [...list].sort(byUrgency);

  const projects = [...new Map(all.map((t) => [t.project_id, `${t.project_name} · ${t.client}`])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es"))
    .map(([value, label]) => ({ value, label }));
  const tecnica = persons
    .filter((p) => p.role === "tecnica" && p.id !== profile.id)
    .map((p) => ({ value: p.id, label: personLabel(p) }));

  const chip = (href: string, n: number, label: string, alert = false) => (
    <Link
      href={href}
      className={`flex min-w-[8.5rem] flex-col border px-4 py-3 hover:bg-panel ${alert && n > 0 ? "border-sw-red" : "border-line"}`}
    >
      <span className={`text-2xl font-extrabold tabular-nums ${alert && n > 0 ? "text-sw-red" : "text-ink"}`}>{n}</span>
      <span className="text-sm text-muted">{label}</span>
    </Link>
  );

  const filtered = Boolean(f.estado || f.vence || f.proyecto || f.responsable);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Bandeja</h1>
      <p className="mt-2 text-muted">
        {open.length} {open.length === 1 ? "tarea abierta" : "tareas abiertas"}, ordenadas por urgencia.
      </p>

      <nav aria-label="Resumen" className="mt-6 flex gap-3 overflow-x-auto pb-1">
        {chip("/bandeja?vence=vencidas", counts.vencidas, "Vencidas", true)}
        {chip("/bandeja?vence=hoy", counts.hoy, "Vencen hoy")}
        {chip("/bandeja?vence=semana", counts.semana, "Próximos 7 días")}
        {chip("/bandeja?estado=falta_informacion", counts.falta, "Esperando info")}
        {chip("/bandeja?responsable=sin", counts.sinResponsable, "Sin responsable")}
      </nav>

      <section aria-label="Filtros" className="mt-8">
        <Filters projects={projects} people={tecnica} />
        {filtered && (
          <Link href="/bandeja" className="mt-3 inline-block text-sm text-sw-blue underline-offset-4 hover:underline">
            Quitar filtros
          </Link>
        )}
      </section>

      {list.length === 0 ? (
        <div className="mt-8 border border-line px-6 py-10">
          <p className="text-lg font-bold">{filtered ? "Nada con estos filtros" : "Bandeja vacía"}</p>
          <p className="mt-1 text-muted">
            {filtered ? "Prueba con otros filtros." : "Cuando entre un pedido aparecerá aquí."}
          </p>
        </div>
      ) : (
        <div className="mt-6 border-t border-line">
          <div className="hidden grid-cols-[11rem_1fr_9rem_10rem_10rem] gap-4 border-b border-line bg-sw-blue px-4 py-2 text-xs font-bold text-white uppercase lg:grid">
            <span>Fecha límite</span>
            <span>Tarea</span>
            <span>Estado</span>
            <span>Responsable</span>
            <span>Pide</span>
          </div>
          <ul>
            {list.map((t, i) => (
              <li key={t.id} className={`border-b border-line ${i % 2 ? "bg-zebra" : "bg-white"}`}>
                <Link
                  href={`/tareas/${t.id}`}
                  className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-panel lg:grid-cols-[11rem_1fr_9rem_10rem_10rem] lg:items-center"
                >
                  <span className="text-sm lg:order-none">
                    <DueLabel due={t.due_date} daysLeft={t.days_left} open={isOpen(t.status)} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.task_type_name}</span>
                    <span className="block truncate text-sm text-muted">
                      {t.project_name} · {t.client}
                    </span>
                    {t.status === "falta_informacion" && t.status_note && (
                      <span className="block truncate text-sm text-st-falta">Falta: {t.status_note}</span>
                    )}
                  </span>
                  <span>
                    <StatusBadge status={t.status} />
                  </span>
                  <span className="text-sm">
                    <span className="text-muted lg:hidden">Responsable: </span>
                    {t.assignee_id ? (names.get(t.assignee_id) ?? "") : <span className="text-muted">Sin asignar</span>}
                  </span>
                  <span className="text-sm text-muted">
                    <span className="lg:hidden">Pide: </span>
                    {names.get(t.requested_by)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-sm text-muted">
        Mostrando {list.length} de {all.length} tareas
        {OPEN_STATUSES.length && !f.estado ? " (solo abiertas)" : ""}.
      </p>
    </main>
  );
}

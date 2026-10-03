"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

const SELECT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-sm outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";

// Filtros en la URL (se pueden compartir y sobreviven a recargar)
export function Filters({ projects, people }: { projects: Option[]; people: Option[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/bandeja${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const field = (id: string, label: string, options: Option[]) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`f-${id}`} className="text-xs font-semibold text-muted uppercase">
        {label}
      </label>
      <select id={`f-${id}`} value={params.get(id) ?? ""} onChange={(e) => set(id, e.target.value)} className={SELECT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {field("estado", "Estado", [
        { value: "", label: "Abiertas" },
        { value: "recibida", label: "Recibida" },
        { value: "falta_informacion", label: "Falta información" },
        { value: "en_curso", label: "En curso" },
        { value: "entregada", label: "Entregada" },
        { value: "cancelada", label: "Cancelada" },
        { value: "todas", label: "Todas" },
      ])}
      {field("vence", "Fecha límite", [
        { value: "", label: "Cualquiera" },
        { value: "vencidas", label: "Vencidas" },
        { value: "hoy", label: "Hasta hoy" },
        { value: "semana", label: "Próximos 7 días" },
        { value: "mes", label: "Próximos 30 días" },
      ])}
      {field("proyecto", "Proyecto", [{ value: "", label: "Todos" }, ...projects])}
      {field("responsable", "Responsable", [
        { value: "", label: "Cualquiera" },
        { value: "yo", label: "Yo" },
        { value: "sin", label: "Sin responsable" },
        ...people,
      ])}
    </div>
  );
}

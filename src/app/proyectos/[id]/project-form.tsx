"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateProject, type ProjectFields } from "./actions";

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";

export function ProjectForm({ id, initial, people }: { id: string; initial: ProjectFields; people: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Editar datos
      </Button>
    );

  const field = (key: keyof ProjectFields, label: string, type = "text") => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`pf-${key}`} className="text-sm font-semibold">
        {label}
      </label>
      <input id={`pf-${key}`} type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={INPUT} />
    </div>
  );

  return (
    <form
      className="grid gap-4 border border-line p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await updateProject(id, f);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      {field("name", "Nombre")}
      {field("client", "Cliente")}
      {field("event_date", "Fecha del evento", "date")}
      {field("venue", "Venue")}
      {field("supplier", "Proveedor técnico")}
      <div className="flex flex-col gap-2">
        <label htmlFor="pf-pm" className="text-sm font-semibold">
          PM responsable
        </label>
        <select id="pf-pm" value={f.pm_id} onChange={(e) => setF({ ...f, pm_id: e.target.value })} className={INPUT}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => { setF(initial); setOpen(false); }}>
          Cancelar
        </Button>
        {error && <p role="alert" className="text-sm font-semibold text-st-falta">{error}</p>}
      </div>
    </form>
  );
}

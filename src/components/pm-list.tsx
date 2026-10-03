"use client";

import { X } from "@phosphor-icons/react";
import { personLabel, type PersonOption } from "@/lib/domain";

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";

// Lista de PM de un proyecto: chips para quitar + desplegable para agregar. Siempre queda al menos uno.
export function PmList({
  id,
  value,
  onChange,
  people,
  currentUserId,
}: {
  id: string;
  value: string[];
  onChange: (ids: string[]) => void;
  people: PersonOption[];
  currentUserId: string;
}) {
  const label = (pid: string) => {
    const p = people.find((x) => x.id === pid);
    return (p ? personLabel(p) : "Usuario") + (pid === currentUserId ? " (yo)" : "");
  };
  const rest = people.filter((p) => !value.includes(p.id));

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        PM del proyecto
      </label>
      <ul className="flex flex-wrap gap-2" aria-label="PM del proyecto">
        {value.map((pid) => (
          <li key={pid} className="inline-flex items-center gap-1 border border-sw-blue bg-zebra py-1 pr-1 pl-3 text-sm font-semibold text-sw-blue">
            {label(pid)}
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== pid))}
                aria-label={`Quitar ${label(pid)}`}
                className="p-1 hover:bg-panel"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <select
          id={id}
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          className={INPUT}
        >
          <option value="">Agregar otro PM...</option>
          {rest.map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p)}
              {p.id === currentUserId ? " (yo)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

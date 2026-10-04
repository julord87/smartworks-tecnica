"use client";

import { useState } from "react";
import { EnvelopeSimple, Phone, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CONTACT_KINDS, CONTACT_LABEL, type ContactDraft, type ContactKind } from "@/lib/domain";

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function contactError(c: ContactDraft): string {
  if (!c.name.trim()) return "Falta el nombre del contacto.";
  if (!c.email.trim() && !c.phone.trim()) return "Pon al menos correo o teléfono.";
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) return "El correo no es válido.";
  return "";
}

type Shown = { kind: ContactKind; name: string; company: string | null; email: string | null; phone: string | null };

// Una fila de contacto: tipo, nombre, empresa y enlaces para escribir o llamar
export function ContactRow({ c, onRemove, removeLabel }: { c: Shown; onRemove?: () => void; removeLabel?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 text-sm">
        <p>
          <span className="text-xs font-bold uppercase tracking-wide text-sw-blue">{CONTACT_LABEL[c.kind]}</span>{" "}
          <span className="font-semibold">{c.name}</span>
          {c.company && <span className="text-muted"> · {c.company}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
          {c.email && (
            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 break-all text-sw-blue underline-offset-4 hover:underline">
              <EnvelopeSimple size={14} weight="bold" /> {c.email}
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 text-sw-blue underline-offset-4 hover:underline">
              <Phone size={14} weight="bold" /> {c.phone}
            </a>
          )}
        </p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel ?? `Quitar ${c.name}`} className="p-2 text-muted hover:text-ink">
          <Trash size={18} />
        </button>
      )}
    </li>
  );
}

// Formulario para agregar un contacto. Valida y devuelve el borrador; quien lo usa decide qué hacer.
export function ContactForm({
  idPrefix,
  defaultKind = "proveedor",
  onAdd,
  pending,
}: {
  idPrefix: string;
  defaultKind?: ContactKind;
  onAdd: (c: ContactDraft) => void | Promise<boolean | void>;
  pending?: boolean;
}) {
  const empty: ContactDraft = { kind: defaultKind, name: "", company: "", email: "", phone: "" };
  const [c, setC] = useState<ContactDraft>(empty);
  const [error, setError] = useState("");
  const field = (key: "name" | "company" | "email" | "phone", label: string, type = "text") => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${idPrefix}-${key}`} className="text-sm font-semibold">
        {label}
      </label>
      <input id={`${idPrefix}-${key}`} type={type} value={c[key]} onChange={(e) => setC({ ...c, [key]: e.target.value })} className={INPUT} />
    </div>
  );

  const add = async () => {
    const e = contactError(c);
    setError(e);
    if (e) return;
    const r = await onAdd({ ...c, email: c.email.trim().toLowerCase(), name: c.name.trim(), company: c.company.trim(), phone: c.phone.trim() });
    if (r !== false) setC({ ...empty, kind: c.kind });
  };

  return (
    <div className="grid gap-3 border border-line bg-zebra p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-kind`} className="text-sm font-semibold">
          Tipo
        </label>
        <select id={`${idPrefix}-kind`} value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as ContactKind })} className={INPUT}>
          {CONTACT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {field("name", "Nombre")}
      {field("company", "Empresa (opcional)")}
      {field("email", "Correo", "email")}
      {field("phone", "Teléfono", "tel")}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="secondary" onClick={add} disabled={pending}>
          Agregar contacto
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-sw-red sm:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}

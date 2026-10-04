"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth";
import { CONTACT_KINDS, CONTACT_LABEL } from "@/lib/domain";
import { addAllowedEmail, removeAllowedEmail, saveTaskType, setUserRole, type TaskTypeFields } from "./actions";

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";
const AREA = "min-h-20 w-full border border-ink/40 bg-white p-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";
const ROLE_LABEL: Record<Role, string> = { solicitante: "Solicitante", tecnica: "Técnica" };

type TaskType = TaskTypeFields & { id: string; description: string | null; is_discovery: boolean };

function useAction() {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setError("");
    start(async () => {
      const r = await fn();
      if (r.ok) {
        after?.();
        router.refresh();
      } else setError(r.error);
    });
  };
  return { error, pending, run };
}

function ErrorText({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="text-sm font-semibold text-sw-red">
      {text}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------
// Tipos de tarea
// ---------------------------------------------------------------------------
export function TaskTypeList({ types }: { types: TaskType[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const nextPos = types.reduce((m, t) => Math.max(m, t.position), 0) + 1;

  return (
    <div className="border-t border-line">
      <ul className="divide-y divide-line border-b border-line">
        {types.map((t) => (
          <li key={t.id}>
            {editing === t.id ? (
              <TaskTypeForm id={t.id} initial={{ ...t, description: t.description ?? "" }} onClose={() => setEditing(null)} />
            ) : (
              <div className={`grid gap-1 py-3 sm:grid-cols-[3rem_1fr_auto] sm:items-start sm:gap-4 ${t.active ? "" : "text-muted"}`}>
                <span className="text-sm tabular-nums text-muted">{t.position}</span>
                <div>
                  <p className="font-semibold">
                    {t.name}
                    {!t.active && <span className="ml-2 text-xs font-bold uppercase text-sw-red">Inactivo</span>}
                    {t.is_discovery && <span className="ml-2 text-xs font-bold uppercase text-sw-blue">Descubrimiento</span>}
                  </p>
                  {t.description && <p className="text-sm text-muted">{t.description}</p>}
                  <p className="mt-1 text-sm">
                    <span className="text-muted">Necesita:</span> {t.needs || "-"} · <span className="text-muted">Entrega:</span> {t.delivers || "-"} ·{" "}
                    <span className="text-muted">Plazo mínimo:</span> {t.min_days} días
                    {t.required_contacts.length > 0 && (
                      <>
                        {" "}
                        · <span className="text-muted">Contactos:</span> {t.required_contacts.map((k) => CONTACT_LABEL[k]).join(", ")}
                      </>
                    )}
                  </p>
                </div>
                <Button type="button" variant="ghost" className="justify-self-start px-0 sm:px-5" onClick={() => setEditing(t.id)} aria-label={`Editar ${t.name}`}>
                  Editar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        {editing === "new" ? (
          <TaskTypeForm
            id={null}
            initial={{ name: "", description: "", needs: "", delivers: "", min_days: 3, position: nextPos, active: true, required_contacts: [] }}
            onClose={() => setEditing(null)}
          />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
            Agregar tipo de tarea
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskTypeForm({ id, initial, onClose }: { id: string | null; initial: TaskTypeFields; onClose: () => void }) {
  const [f, setF] = useState<TaskTypeFields>({
    name: initial.name,
    description: initial.description,
    needs: initial.needs,
    delivers: initial.delivers,
    min_days: initial.min_days,
    position: initial.position,
    active: initial.active,
    required_contacts: initial.required_contacts ?? [],
  });
  const { error, pending, run } = useAction();
  const p = id ?? "nuevo";

  const text = (key: "name" | "description" | "needs" | "delivers", label: string, area = false) => (
    <div className={`flex flex-col gap-2 ${area ? "md:col-span-2" : ""}`}>
      <label htmlFor={`tt-${p}-${key}`} className="text-sm font-semibold">
        {label}
      </label>
      {area ? (
        <textarea id={`tt-${p}-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={AREA} />
      ) : (
        <input id={`tt-${p}-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={INPUT} />
      )}
    </div>
  );

  return (
    <form
      className="my-3 grid gap-4 border border-line bg-zebra p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveTaskType(id, f), onClose);
      }}
    >
      {text("name", "Nombre")}
      {text("description", "Descripción")}
      {text("needs", "Qué se necesita para empezar", true)}
      {text("delivers", "Qué se entrega", true)}
      <div className="flex flex-col gap-2">
        <label htmlFor={`tt-${p}-min`} className="text-sm font-semibold">
          Plazo mínimo (días)
        </label>
        <input id={`tt-${p}-min`} type="number" min={0} value={f.min_days} onChange={(e) => setF({ ...f, min_days: Number(e.target.value) })} className={INPUT} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`tt-${p}-pos`} className="text-sm font-semibold">
          Orden
        </label>
        <input id={`tt-${p}-pos`} type="number" value={f.position} onChange={(e) => setF({ ...f, position: Number(e.target.value) })} className={INPUT} />
      </div>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-semibold">Contactos obligatorios para pedirla</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {CONTACT_KINDS.map((k) => (
            <label key={k.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.required_contacts.includes(k.value)}
                onChange={(e) =>
                  setF({
                    ...f,
                    required_contacts: e.target.checked
                      ? [...f.required_contacts, k.value]
                      : f.required_contacts.filter((x) => x !== k.value),
                  })
                }
                className="size-5 accent-sw-blue"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-5 accent-sw-blue" />
        Activo (se puede pedir)
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <ErrorText text={error} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Correos con acceso
// ---------------------------------------------------------------------------
export function AllowedEmails({ emails }: { emails: { email: string; role: Role; note: string | null; created_at: string }[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("solicitante");
  const [note, setNote] = useState("");
  const { error, pending, run } = useAction();

  return (
    <div>
      <form
        className="grid gap-3 border border-line p-4 md:grid-cols-[1fr_10rem_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addAllowedEmail(email, role, note), () => {
            setEmail("");
            setNote("");
            setRole("solicitante");
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-email" className="text-sm font-semibold">
            Correo
          </label>
          <input id="ae-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-role" className="text-sm font-semibold">
            Rol al entrar
          </label>
          <select id="ae-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={INPUT}>
            <option value="solicitante">Solicitante</option>
            <option value="tecnica">Técnica</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-note" className="text-sm font-semibold">
            Nota (opcional)
          </label>
          <input id="ae-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Empresa, motivo..." className={INPUT} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Agregando..." : "Agregar"}
        </Button>
        <div className="md:col-span-4">
          <ErrorText text={error} />
        </div>
      </form>
      {emails.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin correos cargados.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {emails.map((e) => (
            <EmailRow key={e.email} {...e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmailRow({ email, role, note, created_at }: { email: string; role: Role; note: string | null; created_at: string }) {
  const { error, pending, run } = useAction();
  return (
    <li className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="font-semibold break-all">{email}</p>
        <p className="text-sm text-muted">
          {ROLE_LABEL[role]} · desde {created_at}
          {note && ` · ${note}`}
        </p>
        <ErrorText text={error} />
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        className="justify-self-start px-0 sm:px-5"
        aria-label={`Quitar ${email}`}
        onClick={() => {
          if (confirm(`¿Quitar ${email} de la lista?`)) run(() => removeAllowedEmail(email));
        }}
      >
        Quitar
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Usuarios y roles
// ---------------------------------------------------------------------------
export function UserRoles({ users, meId }: { users: { id: string; email: string; full_name: string | null; role: Role }[]; meId: string }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {users.map((u) => (
        <UserRow key={u.id} user={u} isMe={u.id === meId} />
      ))}
    </ul>
  );
}

function UserRow({ user, isMe }: { user: { id: string; email: string; full_name: string | null; role: Role }; isMe: boolean }) {
  const { error, pending, run } = useAction();
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[1fr_12rem] sm:items-center">
      <div>
        <p className="font-semibold">
          {user.full_name ?? user.email}
          {isMe && <span className="ml-2 text-xs font-bold uppercase text-muted">Vos</span>}
        </p>
        <p className="text-sm break-all text-muted">{user.email}</p>
        <ErrorText text={error} />
      </div>
      {isMe ? (
        <p className="text-sm font-semibold">{ROLE_LABEL[user.role]}</p>
      ) : (
        <select
          aria-label={`Rol de ${user.email}`}
          value={user.role}
          disabled={pending}
          onChange={(e) => run(() => setUserRole(user.id, e.target.value as Role))}
          className={INPUT}
        >
          <option value="solicitante">Solicitante</option>
          <option value="tecnica">Técnica</option>
        </select>
      )}
    </li>
  );
}

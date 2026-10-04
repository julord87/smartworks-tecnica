"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTecnica, type Role } from "@/lib/auth";
import { CONTACT_KINDS, type ContactKind } from "@/lib/domain";

type Result = { ok: true } | { ok: false; error: string };

export type TaskTypeFields = {
  name: string;
  description: string;
  needs: string;
  delivers: string;
  min_days: number;
  position: number;
  active: boolean;
  required_contacts: ContactKind[];
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(f: TaskTypeFields) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    needs: f.needs.trim(),
    delivers: f.delivers.trim(),
    min_days: Math.max(0, Math.floor(Number(f.min_days) || 0)),
    position: Math.floor(Number(f.position) || 0),
    active: !!f.active,
    required_contacts: [...new Set(f.required_contacts ?? [])].filter((k) => CONTACT_KINDS.some((c) => c.value === k)),
  };
}

function done(): Result {
  revalidatePath("/catalogo");
  revalidatePath("/como-trabajamos");
  revalidatePath("/pedidos/nuevo");
  return { ok: true };
}

export async function saveTaskType(id: string | null, f: TaskTypeFields): Promise<Result> {
  await requireTecnica();
  const row = clean(f);
  if (!row.name) return { ok: false, error: "El nombre es obligatorio." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("task_types").update(row).eq("id", id)
    : await supabase.from("task_types").insert(row);
  if (error) {
    console.error("saveTaskType", error);
    return { ok: false, error: error.code === "23505" ? "Ya existe un tipo con ese nombre." : "No se pudo guardar." };
  }
  return done();
}

export async function addAllowedEmail(email: string, role: Role, note: string): Promise<Result> {
  await requireTecnica();
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Correo no válido." };
  if (role !== "solicitante" && role !== "tecnica") return { ok: false, error: "Rol no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").insert({ email: e, role, note: note.trim() || null });
  if (error) {
    console.error("addAllowedEmail", error);
    return { ok: false, error: error.code === "23505" ? "Ese correo ya está en la lista." : "No se pudo agregar." };
  }
  return done();
}

export async function removeAllowedEmail(email: string): Promise<Result> {
  await requireTecnica();
  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").delete().eq("email", email);
  if (error) {
    console.error("removeAllowedEmail", error);
    return { ok: false, error: "No se pudo quitar." };
  }
  return done();
}

export async function setUserRole(userId: string, role: Role): Promise<Result> {
  const me = await requireTecnica();
  if (userId === me.id) return { ok: false, error: "No podés cambiar tu propio rol." };
  if (role !== "solicitante" && role !== "tecnica") return { ok: false, error: "Rol no válido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", userId).select("id");
  if (error || !data?.length) {
    console.error("setUserRole", error);
    return { ok: false, error: "No se pudo cambiar el rol." };
  }
  return done();
}

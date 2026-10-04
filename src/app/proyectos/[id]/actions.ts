"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ContactDraft } from "@/lib/domain";

export type ProjectFields = {
  name: string;
  client: string;
  event_date: string;
  venue: string;
  supplier: string;
  pm_ids: string[];
};

export async function updateProject(id: string, f: ProjectFields): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  if (!f.name.trim() || !f.client.trim()) return { ok: false, error: "Nombre y cliente son obligatorios." };
  const pmIds = [...new Set(f.pm_ids)];
  if (pmIds.length === 0) return { ok: false, error: "El proyecto necesita al menos un PM." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: f.name.trim(),
      client: f.client.trim(),
      event_date: f.event_date || null,
      venue: f.venue.trim() || null,
      supplier: f.supplier.trim() || null,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("updateProject", error);
    return { ok: false, error: "No se pudo guardar el proyecto." };
  }
  if (!data?.length) return { ok: false, error: "Solo los PM, quien creó el proyecto o Técnica pueden editarlo." };

  // PM: primero se agregan los nuevos y después se quitan los que salen (nunca queda vacío)
  const { data: current } = await supabase.from("project_managers").select("profile_id").eq("project_id", id);
  const before = (current ?? []).map((m) => m.profile_id as string);
  const added = pmIds.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !pmIds.includes(p));
  if (added.length) {
    const { error: e } = await supabase.from("project_managers").insert(added.map((profile_id) => ({ project_id: id, profile_id })));
    if (e) {
      console.error("project_managers insert", e);
      return { ok: false, error: "Se guardaron los datos, pero no se pudieron agregar los PM." };
    }
  }
  if (removed.length) {
    const { error: e } = await supabase.from("project_managers").delete().eq("project_id", id).in("profile_id", removed);
    if (e) {
      console.error("project_managers delete", e);
      return { ok: false, error: "Se guardaron los datos, pero no se pudieron quitar los PM." };
    }
  }
  revalidatePath(`/proyectos/${id}`);
  return { ok: true };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KINDS = ["proveedor", "cliente", "venue", "venue_tecnico"];

export async function addContact(projectId: string, c: ContactDraft): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  if (!KINDS.includes(c.kind) || !c.name.trim()) return { ok: false, error: "Faltan datos del contacto." };
  if (!c.email.trim() && !c.phone.trim()) return { ok: false, error: "Pon al menos correo o teléfono." };
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) return { ok: false, error: "El correo no es válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("project_contacts").insert({
    project_id: projectId,
    kind: c.kind,
    name: c.name.trim(),
    company: c.company.trim() || null,
    email: c.email.trim().toLowerCase() || null,
    phone: c.phone.trim() || null,
  });
  if (error) {
    console.error("addContact", error);
    return { ok: false, error: "No se pudo agregar el contacto." };
  }
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

export async function removeContact(projectId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_contacts").delete().eq("id", contactId).select("id");
  if (error || !data?.length) {
    if (error) console.error("removeContact", error);
    return { ok: false, error: "No se pudo quitar el contacto." };
  }
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

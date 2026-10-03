"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export type ProjectFields = {
  name: string;
  client: string;
  event_date: string;
  venue: string;
  supplier: string;
  pm_id: string;
};

export async function updateProject(id: string, f: ProjectFields): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  if (!f.name.trim() || !f.client.trim()) return { ok: false, error: "Nombre y cliente son obligatorios." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: f.name.trim(),
      client: f.client.trim(),
      event_date: f.event_date || null,
      venue: f.venue.trim() || null,
      supplier: f.supplier.trim() || null,
      pm_id: f.pm_id,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("updateProject", error);
    return { ok: false, error: "No se pudo guardar el proyecto." };
  }
  if (!data?.length) return { ok: false, error: "Solo el PM, quien creó el proyecto o Técnica pueden editarlo." };
  revalidatePath(`/proyectos/${id}`);
  return { ok: true };
}

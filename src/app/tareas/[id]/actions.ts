"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireTecnica } from "@/lib/auth";
import type { AttachmentKind, TaskStatus } from "@/lib/domain";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Errores de la base que ya vienen redactados para el usuario (raise exception)
function fail(error: { code?: string; message: string }, fallback: string): ActionResult {
  if (error.code === "P0001") return { ok: false, error: error.message };
  if (error.code === "42501") return { ok: false, error: "No tienes permiso para hacer esto." };
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function refresh(taskId: string) {
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/bandeja");
  revalidatePath("/pedidos");
}

export async function changeStatus(taskId: string, status: TaskStatus, note: string): Promise<ActionResult> {
  await requireTecnica();
  if (status === "falta_informacion" && !note.trim()) {
    return { ok: false, error: "Escribe qué información falta." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, status_note: note.trim() || null })
    .eq("id", taskId)
    .select("id");
  if (error) return fail(error, "No se pudo cambiar el estado.");
  if (!data?.length) return { ok: false, error: "No tienes permiso para cambiar el estado." };
  refresh(taskId);
  return { ok: true };
}

export async function updateTask(
  taskId: string,
  fields: { assignee_id?: string | null; due_date?: string },
): Promise<ActionResult> {
  await requireTecnica();
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update(fields).eq("id", taskId).select("id");
  if (error) return fail(error, "No se pudo guardar el cambio.");
  if (!data?.length) return { ok: false, error: "No tienes permiso para editar esta tarea." };
  refresh(taskId);
  return { ok: true };
}

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!body.trim()) return { ok: false, error: "Escribe un comentario." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_events")
    .insert({ task_id: taskId, author_id: profile.id, kind: "comentario", body: body.trim() });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Solo pueden comentar quienes participan en el proyecto." };
    return fail(error, "No se pudo guardar el comentario.");
  }
  refresh(taskId);
  return { ok: true };
}

export async function registerTaskAttachment(
  taskId: string,
  file: { storage_path: string; file_name: string; mime_type: string | null; size_bytes: number; kind: AttachmentKind },
): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({ task_id: taskId, uploaded_by: profile.id, ...file });
  if (error) return fail(error, "El archivo se subió pero no se pudo registrar.");
  refresh(taskId);
  return { ok: true };
}

export async function addDeliverable(
  taskId: string,
  d: { url?: string; storage_path?: string; file_name: string; note: string },
  markDelivered: boolean,
): Promise<ActionResult> {
  const profile = await requireTecnica();
  if (!d.url && !d.storage_path) return { ok: false, error: "Sube un archivo o pega un enlace." };
  if (d.url && !/^https?:\/\//i.test(d.url)) return { ok: false, error: "El enlace tiene que empezar por http:// o https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").insert({
    task_id: taskId,
    url: d.url || null,
    storage_path: d.storage_path || null,
    file_name: d.file_name.trim() || null,
    note: d.note.trim() || null,
    uploaded_by: profile.id,
  });
  if (error) return fail(error, "No se pudo guardar el entregable.");
  if (markDelivered) {
    const { error: e2 } = await supabase.from("tasks").update({ status: "entregada", status_note: null }).eq("id", taskId);
    if (e2) return fail(e2, "Entregable guardado, pero no se pudo marcar como entregada.");
  }
  refresh(taskId);
  return { ok: true };
}

export async function addTasksToRequest(
  taskId: string,
  requestId: string,
  tasks: { task_type_id: string; due_date: string; notes: string }[],
): Promise<ActionResult> {
  const profile = await requireTecnica();
  if (!tasks.length) return { ok: false, error: "Elige al menos una tarea." };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert(
    tasks.map((t) => ({
      request_id: requestId,
      task_type_id: t.task_type_id,
      due_date: t.due_date,
      notes: t.notes.trim() || null,
      created_by: profile.id,
    })),
  );
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Solo se pueden agregar tareas a pedidos con “No sé qué necesito”." };
    return fail(error, "No se pudieron agregar las tareas.");
  }
  refresh(taskId);
  return { ok: true };
}

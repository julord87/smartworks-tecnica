"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { AttachmentKind } from "@/lib/domain";

export type NewRequestInput = {
  projectId: string | null;
  newProject: { name: string; client: string; event_date: string; venue: string; supplier: string; pm_ids: string[] } | null;
  comment: string;
  watchers: string[];
  tasks: { task_type_id: string; due_date: string; notes: string }[];
  fileCount: number;
};

export type CreateResult = { ok: true; projectId: string; requestId: string } | { ok: false; error: string };

export async function createRequest(input: NewRequestInput): Promise<CreateResult> {
  await requireProfile();
  const supabase = await createClient();

  if (input.tasks.length === 0) return { ok: false, error: "Marca al menos una tarea." };
  const pmIds = [...new Set(input.newProject?.pm_ids ?? [])];
  if (input.newProject && pmIds.length === 0) return { ok: false, error: "El proyecto necesita al menos un PM." };

  // "No se que necesito" exige adjuntos
  const { data: discovery } = await supabase.from("task_types").select("id").eq("is_discovery", true);
  const discoveryIds = new Set((discovery ?? []).map((d) => d.id as string));
  if (input.fileCount === 0 && input.tasks.some((t) => discoveryIds.has(t.task_type_id))) {
    return { ok: false, error: "Con “No sé qué necesito” hay que adjuntar al menos un archivo (briefing, proposal...)." };
  }

  const { data, error } = await supabase.rpc("create_request", {
    p_project_id: input.projectId,
    p_new_project: input.newProject && { ...input.newProject, pm_ids: undefined, pm_id: pmIds[0] },
    p_comment: input.comment,
    p_tasks: input.tasks,
    p_watchers: input.watchers,
  });

  if (error) {
    // Los mensajes de create_request ya estan pensados para el usuario
    const userFacing = error.code === "P0001";
    if (!userFacing) console.error("create_request", error);
    return { ok: false, error: userFacing ? error.message : "No se pudo crear el pedido. Inténtalo de nuevo." };
  }

  const r = data as { project_id: string; request_id: string };
  // ponytail: PM extra en un segundo paso; si falla, el proyecto queda con el primero y se corrige en su página
  if (pmIds.length > 1) {
    const { error: pmError } = await supabase
      .from("project_managers")
      .insert(pmIds.slice(1).map((profile_id) => ({ project_id: r.project_id, profile_id })));
    if (pmError) console.error("project_managers", pmError);
  }
  return { ok: true, projectId: r.project_id, requestId: r.request_id };
}

export type UploadedFile = {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  kind: AttachmentKind;
};

export async function registerAttachments(
  projectId: string,
  requestId: string,
  files: UploadedFile[],
): Promise<{ ok: boolean; error?: string }> {
  await requireProfile();
  if (files.length === 0) return { ok: true };

  const prefix = `${projectId}/requests/${requestId}/`;
  if (files.some((f) => !f.storage_path.startsWith(prefix))) {
    return { ok: false, error: "Ruta de archivo no válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert(
    files.map((f) => ({
      request_id: requestId,
      kind: f.kind,
      storage_path: f.storage_path,
      file_name: f.file_name,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
    })),
  );
  if (error) {
    console.error("registerAttachments", error);
    return { ok: false, error: "Los archivos se subieron pero no se pudieron registrar en el pedido." };
  }
  return { ok: true };
}

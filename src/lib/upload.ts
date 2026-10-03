"use client";

import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET, safeFileName } from "@/lib/domain";

// Sube un archivo directo del navegador a Storage bajo `prefix` y devuelve la ruta
export async function uploadFile(prefix: string, file: File): Promise<{ path: string } | { error: string }> {
  const path = `${prefix}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
  const { error } = await createClient()
    .storage.from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  return error ? { error: error.message } : { path };
}

import { createClient } from "@supabase/supabase-js";

// Los endpoints de /api/cron los llama pg_cron (Supabase) con "Authorization: Bearer CRON_SECRET".
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

// Cliente sin sesion: las funciones de la cola validan el secreto en la base de datos
export function cronClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

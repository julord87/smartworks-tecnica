import { createBrowserClient } from "@supabase/ssr";

// Cliente de navegador: solo para subir archivos directo a Storage (sin pasar por el servidor)
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/domain";

export const dynamic = "force-dynamic";

// Enlace estable a un archivo privado: genera una URL firmada de 60 s y redirige.
// El acceso lo decide la politica de Storage (usuario autenticado).
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const name = request.nextUrl.searchParams.get("nombre") ?? undefined;
  if (!path) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60, name ? { download: name } : undefined);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}

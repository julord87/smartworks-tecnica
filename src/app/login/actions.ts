"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "Escribe un correo válido.", email };
  }

  if (!isSupabaseConfigured) {
    return { status: "error", message: "La app todavía no está conectada a Supabase.", email };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Con la plantilla propia el enlace va a /auth/confirm con token_hash (ver supabase/templates).
      // Con la plantilla por defecto de Supabase vuelve aqui con ?code= (PKCE, mismo navegador).
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    // El trigger de alta rechaza correos fuera de @smartworks.es y de la allowlist
    if (/database error/i.test(error.message)) {
      return {
        status: "error",
        message: "Este correo no tiene acceso. Usa tu dirección @smartworks.es o pide acceso a Técnica.",
        email,
      };
    }
    if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) {
      return { status: "error", message: "Demasiados intentos. Espera un minuto y vuelve a probar.", email };
    }
    console.error("signInWithOtp", error);
    return { status: "error", message: "No se pudo enviar el enlace. Inténtalo de nuevo.", email };
  }

  return { status: "sent", email };
}

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email) || !password) {
    return { status: "error", message: "Escribe tu correo y tu contraseña.", email };
  }
  if (!isSupabaseConfigured) {
    return { status: "error", message: "La app todavía no está conectada a Supabase.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { status: "error", message: "Demasiados intentos. Espera un minuto y vuelve a probar.", email };
    }
    // Mismo mensaje para correo inexistente o clave incorrecta
    return { status: "error", message: "Correo o contraseña incorrectos.", email };
  }

  redirect("/");
}

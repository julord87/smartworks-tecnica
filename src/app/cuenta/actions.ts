"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export type PasswordState = { status: "idle" | "ok" | "error"; message?: string };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireProfile();
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password.length < 8) return { status: "error", message: "Usa al menos 8 caracteres." };
  if (password !== repeat) return { status: "error", message: "Las dos contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "Es la misma contraseña que ya tienes." };
    if (error.code === "weak_password") return { status: "error", message: "La contraseña es demasiado débil." };
    console.error("updateUser", error);
    return { status: "error", message: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }
  return { status: "ok" };
}

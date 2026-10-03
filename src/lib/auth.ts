import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "solicitante" | "tecnica";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

// Perfil del usuario logueado (una consulta por request)
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();
  return data as Profile | null;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireTecnica(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "tecnica") redirect("/");
  return profile;
}

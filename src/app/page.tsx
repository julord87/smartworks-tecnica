import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

// Inicio segun rol: Tecnica a su bandeja, solicitantes a sus pedidos
export default async function Home() {
  const profile = await requireProfile();
  redirect(profile.role === "tecnica" ? "/bandeja" : "/pedidos");
}

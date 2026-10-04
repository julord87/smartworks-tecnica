import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_COLUMNS, type Contact, type PersonOption, type ProjectOption, type TaskType } from "@/lib/domain";
import { NewRequestForm } from "./new-request-form";

export const metadata = { title: "Nuevo pedido · Técnica Smartworks" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const { proyecto } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [types, projects, people, contacts] = await Promise.all([
    supabase
      .from("task_types")
      .select("id, position, name, description, needs, delivers, min_days, is_discovery, required_contacts")
      .eq("active", true)
      .order("position"),
    supabase.from("projects").select("id, name, client, event_date").order("name"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    // ponytail: todos los contactos de una vez; filtrar por proyecto en la consulta si crecen mucho
    supabase.from("project_contacts").select(CONTACT_COLUMNS).order("created_at"),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-32 md:pt-12">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Nuevo pedido</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        Marca qué necesitas de Técnica, con fecha límite y los archivos para empezar.
      </p>
      <NewRequestForm
        currentUserId={profile.id}
        taskTypes={(types.data ?? []) as TaskType[]}
        projects={(projects.data ?? []) as ProjectOption[]}
        people={(people.data ?? []) as PersonOption[]}
        contacts={(contacts.data ?? []) as Contact[]}
        initialProjectId={proyecto}
      />
    </main>
  );
}

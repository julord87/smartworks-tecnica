import { requireTecnica } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/dates";
import { AllowedEmails, TaskTypeList, UserRoles } from "./catalog-panels";

export const metadata = { title: "Catálogo · Técnica Smartworks" };

const TITLE = "mb-1 text-sm font-bold uppercase tracking-wide text-sw-blue";

export default async function CatalogPage() {
  const me = await requireTecnica();
  const supabase = await createClient();
  const [{ data: types }, { data: emails }, { data: users }] = await Promise.all([
    supabase.from("task_types").select("id, name, description, needs, delivers, min_days, position, active, is_discovery, required_contacts").order("position"),
    supabase.from("allowed_emails").select("email, role, note, created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, email, full_name, role").order("email"),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Catálogo</h1>
      <p className="mt-2 max-w-2xl text-muted">Tipos de tarea que se pueden pedir, correos con acceso y roles. Solo Técnica ve esta página.</p>

      <section aria-labelledby="s-tipos" className="mt-10">
        <h2 id="s-tipos" className={TITLE}>
          Tipos de tarea
        </h2>
        <p className="mb-4 text-sm text-muted">Los inactivos no aparecen en Nuevo pedido ni en Cómo trabajamos. Las tareas ya pedidas no cambian.</p>
        <TaskTypeList types={types ?? []} />
      </section>

      <section aria-labelledby="s-correos" className="mt-12">
        <h2 id="s-correos" className={TITLE}>
          Correos con acceso
        </h2>
        <p className="mb-4 text-sm text-muted">
          Cualquier <strong>@smartworks.es</strong> entra solo. Acá se agregan externos, o internos que tienen que entrar directamente como Técnica.
          Quitar un correo impide nuevas altas, pero no borra una cuenta ya creada.
        </p>
        <AllowedEmails emails={(emails ?? []).map((e) => ({ ...e, created_at: shortDate(e.created_at) }))} />
      </section>

      <section aria-labelledby="s-usuarios" className="mt-12">
        <h2 id="s-usuarios" className={TITLE}>
          Usuarios y roles
        </h2>
        <p className="mb-4 text-sm text-muted">Solo quien tiene rol Técnica puede ser responsable de tareas y cambiar estados.</p>
        <UserRoles users={users ?? []} meId={me.id} />
      </section>
    </main>
  );
}

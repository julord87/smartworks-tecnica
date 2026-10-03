import { requireProfile } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Mi cuenta · Técnica Smartworks" };

export default async function AccountPage() {
  const profile = await requireProfile();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Mi cuenta</h1>
      <dl className="mt-6 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
        <dt className="text-muted">Nombre</dt>
        <dd className="font-semibold">{profile.full_name ?? "Sin nombre"}</dd>
        <dt className="text-muted">Correo</dt>
        <dd className="font-semibold">{profile.email}</dd>
        <dt className="text-muted">Rol</dt>
        <dd className="font-semibold">{profile.role === "tecnica" ? "Técnica" : "Solicitante"}</dd>
      </dl>
      <section className="mt-10 max-w-md border-t border-line pt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-sw-blue">Contraseña</h2>
        <PasswordForm />
      </section>
    </main>
  );
}

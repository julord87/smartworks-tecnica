import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue">Página no encontrada</h1>
      <p className="mt-3 max-w-[60ch] text-muted">La dirección no existe o esta sección todavía no está disponible.</p>
      <Link href="/" className={buttonClass("secondary", "mt-8")}>
        Volver al inicio
      </Link>
    </main>
  );
}

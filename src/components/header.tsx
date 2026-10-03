import Link from "next/link";
import { SignOut, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { getProfile } from "@/lib/auth";
import { NavLinks } from "./nav-links";

// Cabecera de la casa: franja roja (marca) + barra azul (navegacion)
export async function Header() {
  const profile = await getProfile();
  if (!profile) return null;

  const isTecnica = profile.role === "tecnica";
  const links = isTecnica
    ? [
        { href: "/bandeja", label: "Bandeja" },
        { href: "/pedidos/nuevo", label: "Nuevo pedido" },
        { href: "/catalogo", label: "Catálogo" },
        { href: "/como-trabajamos", label: "Cómo trabajamos" },
      ]
    : [
        { href: "/pedidos", label: "Mis pedidos" },
        { href: "/pedidos/nuevo", label: "Nuevo pedido" },
        { href: "/como-trabajamos", label: "Cómo trabajamos" },
      ];

  return (
    <header>
      <div className="bg-sw-red text-white">
        <div className="mx-auto flex h-7 max-w-6xl items-center justify-between px-4 text-[11px] font-bold tracking-wide">
          <span>PRODUCCIÓN TÉCNICA</span>
          <span>SMARTWORKS</span>
        </div>
      </div>
      <div className="bg-sw-blue text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4">
          <Link href="/" className="py-3 text-lg font-extrabold italic uppercase tracking-tight">
            Técnica
          </Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-4 py-3 text-sm">
            <Link href="/cuenta" className="inline-flex items-center gap-1.5 text-white/85 hover:text-white" aria-label="Mi cuenta">
              <UserCircle size={20} weight="bold" />
              <span className="hidden md:inline">
                {profile.full_name ?? profile.email}
                {isTecnica && <span className="ml-2 font-semibold text-white">Técnica</span>}
              </span>
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="inline-flex items-center gap-1.5 text-white/90 hover:text-white" aria-label="Salir">
                <SignOut size={18} weight="bold" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}

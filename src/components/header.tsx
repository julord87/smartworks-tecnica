import Link from "next/link";
import { getProfile } from "@/lib/auth";

export async function Header() {
  const profile = await getProfile();
  if (!profile) return null;

  const links =
    profile.role === "tecnica"
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
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          Técnica Smartworks
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-gray-900 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-gray-600 sm:inline">
            {profile.full_name ?? profile.email}
            {profile.role === "tecnica" && <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">Técnica</span>}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-gray-600 hover:text-gray-900 hover:underline">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="order-last -mx-4 flex w-full gap-1 overflow-x-auto px-4 pb-2 text-sm md:order-none md:mx-0 md:w-auto md:p-0">
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== "/pedidos" && pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-2 py-2 whitespace-nowrap md:py-3 ${
              active ? "border-white font-semibold text-white" : "border-transparent text-white/75 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

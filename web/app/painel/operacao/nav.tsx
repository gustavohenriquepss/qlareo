"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/painel/operacao/campanhas", label: "Campanhas" },
  { href: "/painel/operacao/restaurantes", label: "Restaurantes" },
  { href: "/painel/operacao/anunciantes", label: "Anunciantes" },
];

export function OperacaoNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Área de operação">
      <ul className="flex w-full gap-1 rounded-2xl bg-surface-2 p-1 sm:inline-flex sm:w-auto">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-10 items-center justify-center rounded-xl px-2.5 text-sm font-semibold whitespace-nowrap sm:px-4",
                  active ? "bg-surface text-ink shadow-[0_1px_3px_rgba(15,23,42,0.08)]" : "text-ink-secondary hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

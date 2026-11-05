import { Logo } from "@/components/Logo";
import { LANDING_URL } from "@/lib/site";

/** Moldura das telas de acesso: a logo leva para a landing, o cartão vem no centro. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <a href={LANDING_URL} aria-label="Qlareo, ir para o site" className="mb-8 inline-flex">
        <Logo className="h-7 w-auto text-ink" />
      </a>
      <main className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.08)] sm:p-8">
        {children}
      </main>
    </div>
  );
}

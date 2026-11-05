import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/account";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const account = await requireAccount();

  return (
    <>
      <header className="bg-surface shadow-[0_1px_0_var(--border)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Link href="/painel" aria-label="Qlareo, início do painel">
              <Logo className="h-6 w-auto text-ink" />
            </Link>
            {account.isOperator ? (
              <Link href="/painel/operacao" className="text-sm font-semibold text-ink-secondary hover:text-ink">
                Operação
              </Link>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-ink-muted sm:inline">{account.email}</span>
            <form action={signOut}>
              <Button type="submit" size="sm" variant="secondary">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}

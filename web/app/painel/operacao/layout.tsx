import type { Metadata } from "next";
import { requireOperator } from "@/lib/account";
import { OperacaoNav } from "./nav";

export const metadata: Metadata = { title: "Operação · Qlareo" };

/** Só operador entra; para qualquer outra conta a área não existe (404). */
export default async function OperacaoLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return (
    <div className="flex flex-col gap-6">
      <OperacaoNav />
      {children}
    </div>
  );
}

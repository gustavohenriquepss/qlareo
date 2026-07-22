/**
 * `/` não é mais uma tela: Vendas virou uma seção com três recortes, e a raiz
 * manda para o primeiro deles.
 *
 * Redirecionar em vez de duplicar a página em `/` e `/vendas` porque duas URLs
 * mostrando a mesma coisa quebram o estado ativo da navegação e produzem
 * favoritos que divergem na próxima mudança.
 *
 * A query string viaja junto: um link antigo para `/?from=…&to=…` continua
 * abrindo o mesmo período. Perder o filtro no redirect seria pior que não
 * redirecionar.
 */
import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) qs.set(key, value[0]);
  }

  redirect(qs.size > 0 ? `/vendas?${qs}` : "/vendas");
}

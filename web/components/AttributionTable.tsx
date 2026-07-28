/**
 * Tabela de atribuição (cupom, origem ou campanha) — a mesma forma para os três
 * recortes de `coupons-and-sources`.
 *
 * Vive num componente só porque a regra da LINHA DE AUSÊNCIA ("Sem cupom",
 * "Direto / não rastreado") é o que dá sentido à tela, e não pode divergir entre
 * as páginas: a ausência é uma linha somável em tom secundário, nunca um buraco.
 * Duas cópias dessa regra em dois arquivos acabariam com a tabela de cupom e a de
 * origem tratando a ausência de forma diferente.
 */
import { DataTable, type Column } from "@/components/DataTable";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import type { AttributionRow } from "@/lib/types";
import type { ReactNode } from "react";

/** Rótulos que o backend usa para "não é um valor, é a ausência dele". */
export const SEM_CUPOM = "Sem cupom";
export const SEM_ORIGEM = "Direto / não rastreado";

function colunas(header: string): Array<Column<AttributionRow>> {
  return [
    {
      key: "chave",
      header,
      // A linha de ausência fica em tom secundário: continua visível e somável,
      // mas não disputa a leitura com um cupom ou campanha de verdade.
      render: (r) => (
        <span
          className={
            r.chave === SEM_CUPOM || r.chave === SEM_ORIGEM
              ? "text-ink-muted"
              : "text-ink"
          }
        >
          {r.chave}
        </span>
      ),
    },
    {
      key: "faturamento",
      header: "Faturamento",
      numeric: true,
      render: (r) => formatMoney(r.faturamento),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (r) => formatInt(r.pedidos),
    },
    {
      key: "participacao",
      header: "% do período",
      numeric: true,
      render: (r) => formatPercent(r.participacao),
    },
  ];
}

export function AttributionTable({
  header,
  caption,
  rows,
  footer,
}: {
  header: string;
  caption: string;
  rows: AttributionRow[];
  footer?: ReactNode;
}) {
  return (
    <DataTable
      caption={caption}
      columns={colunas(header)}
      rows={rows}
      rowKey={(r) => r.chave}
      footer={footer}
    />
  );
}

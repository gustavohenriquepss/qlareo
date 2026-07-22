/**
 * Os três números de topo de Vendas, repetidos nas três sub-abas.
 *
 * Repetir é deliberado. Um ranking de sellers sem o faturamento total ao lado
 * não tem escala: "R$ 40 mil no seller X" é ótimo ou péssimo conforme o total
 * seja 50 mil ou 500 mil. Como as sub-abas são rotas separadas, o número de
 * referência tem que viajar com cada uma — e o dado já veio na mesma resposta,
 * então não custa requisição nenhuma.
 */
import { StatTile } from "@/components/StatTile";
import type { Filters } from "@/lib/filters";
import { formatInt, formatISODate, formatMoney } from "@/lib/format";
import type { SalesReport } from "@/lib/types";

export function SalesHeadline({
  report,
  filters,
}: {
  report: SalesReport;
  filters: Filters;
}) {
  const periodo = `${formatISODate(filters.from)} a ${formatISODate(filters.to)}`;

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile
        label="Faturamento"
        value={formatMoney(report.totalFaturamento)}
        context={periodo}
        emphasis
      />
      <StatTile
        label="Pedidos"
        value={formatInt(report.totalPedidos)}
        context={`Recorte: ${filters.scope}`}
      />
      <StatTile
        label="Ticket médio"
        value={formatMoney(report.ticketMedioGeral)}
        context="Faturamento ÷ pedidos"
      />
    </dl>
  );
}

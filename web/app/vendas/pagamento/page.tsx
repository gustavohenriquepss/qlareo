/**
 * Vendas › Meio de pagamento.
 *
 * Mesma resposta de `sales-by-period` do recorte por período; aqui só o
 * `porPagamento`. Ver o comentário em `app/vendas/page.tsx`.
 */
import { ExportBar } from "@/components/ExportBar";
import { RankSection } from "@/components/RankSection";
import { SalesHeadline } from "@/components/SalesHeadline";
import { EmptyState, ErrorState } from "@/components/States";
import type { RankRow } from "@/components/charts/RankBarChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import type { SalesReport } from "@/lib/types";

export default async function VendasPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<SalesReport>(
    "sales-by-period",
    toApiQuery(filters),
  );

  if (!result.ok) {
    return <ErrorState error={result.error} hint={result.hint} />;
  }

  const report = result.data;

  if (report.totalPedidos === 0) {
    return <EmptyState />;
  }

  const rows: RankRow[] = report.porPagamento.map((p) => ({
    rotulo: p.metodo,
    faturamento: p.faturamento,
    pedidos: p.pedidos,
  }));

  return (
    <div className="space-y-4">
      <ExportBar page="/vendas/pagamento" filters={filters} />

      <SalesHeadline report={report} filters={filters} />

      <RankSection
        title="Faturamento por meio de pagamento"
        hint="Ordenado por faturamento, do maior para o menor."
        columnHeader="Meio de pagamento"
        rows={rows}
        totalPeriodo={report.totalFaturamento}
        gapNote="São pedidos que vieram da VTEX sem o meio de pagamento informado."
        emptyMessage="Nenhum pedido do período trouxe o meio de pagamento."
      />
    </div>
  );
}

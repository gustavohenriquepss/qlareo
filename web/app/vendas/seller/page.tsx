/**
 * Vendas › Seller.
 *
 * Mesma resposta de `sales-by-period` do recorte por período; aqui só o
 * `porSeller`. Ver o comentário em `app/vendas/page.tsx`.
 */
import { ExportBar } from "@/components/ExportBar";
import { RankSection } from "@/components/RankSection";
import { SalesHeadline } from "@/components/SalesHeadline";
import { EmptyState, ErrorState } from "@/components/States";
import type { RankRow } from "@/components/charts/RankBarChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import type { SalesReport } from "@/lib/types";

export default async function VendasSellerPage({
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

  const rows: RankRow[] = report.porSeller.map((s) => ({
    rotulo: s.seller,
    faturamento: s.faturamento,
    pedidos: s.pedidos,
  }));

  return (
    <div className="space-y-4">
      <ExportBar page="/vendas/seller" filters={filters} />

      <SalesHeadline report={report} filters={filters} />

      <RankSection
        title="Faturamento por seller"
        hint={'Pedidos sem seller informado aparecem como "—".'}
        columnHeader="Seller"
        rows={rows}
        totalPeriodo={report.totalFaturamento}
        gapNote="São pedidos cujo seller não veio na resposta da VTEX."
        emptyMessage="Nenhum pedido do período trouxe o seller."
      />
    </div>
  );
}

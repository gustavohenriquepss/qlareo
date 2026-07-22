/**
 * Vendas › Período — a tela inicial, porque é a pergunta que o lojista faz
 * primeiro: "quanto vendi?".
 *
 * Os três recortes de Vendas (período, meio de pagamento, seller) leem a MESMA
 * resposta do backend (`sales-by-period`) e cada um mostra uma fatia dela. A
 * duplicação da chamada é intencional e barata: cada recorte é uma rota, com
 * URL e exportação próprias, e o `fetch` sai sem cache de qualquer forma. A
 * navegação entre eles fica no menu da esquerda (ver Nav), não sobre o gráfico.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportBar } from "@/components/ExportBar";
import { SalesHeadline } from "@/components/SalesHeadline";
import { EmptyState, ErrorState } from "@/components/States";
import { SalesTrendChart } from "@/components/charts/SalesTrendChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatBucketLong, formatInt, formatMoney } from "@/lib/format";
import type { SalesReport, SalesRow } from "@/lib/types";

const GRAIN_LABEL = { day: "dia", week: "semana", month: "mês" } as const;

export default async function VendasPeriodoPage({
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

  const columns: Array<Column<SalesRow>> = [
    {
      key: "bucket",
      header: filters.grain === "day" ? "Dia" : "Período",
      render: (r) => formatBucketLong(r.bucket, filters.grain),
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
      key: "ticket",
      header: "Ticket médio",
      numeric: true,
      render: (r) => formatMoney(r.ticketMedio),
    },
  ];

  return (
    <div className="space-y-4">
      <ExportBar page="/vendas" filters={filters} />

      <SalesHeadline report={report} filters={filters} />

      <Card
        title={`Faturamento por ${GRAIN_LABEL[filters.grain]}`}
        hint="Passe o mouse para ver faturamento, pedidos e ticket médio do período."
      >
        <SalesTrendChart rows={report.linhas} grain={filters.grain} />
      </Card>

      {/* A tabela em bloco próprio, como na tela de produtos: gráfico e tabela
          respondem perguntas diferentes ("qual é a forma" e "quanto
          exatamente"), e cada bloco com seu título deixa o olho pular direto
          para a que interessa em vez de varrer um cartão comprido. */}
      <Card
        title={`Valores por ${GRAIN_LABEL[filters.grain]}`}
        hint="Os mesmos números do gráfico, com o valor exato de cada período."
      >
        <DataTable
          caption={`Faturamento por ${GRAIN_LABEL[filters.grain]}`}
          columns={columns}
          rows={report.linhas}
          rowKey={(r) => r.bucket}
          footer={
            <tr>
              <td className="px-3 py-2 text-left">Total</td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(report.totalFaturamento)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(report.totalPedidos)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(report.ticketMedioGeral)}
              </td>
            </tr>
          }
        />
      </Card>
    </div>
  );
}

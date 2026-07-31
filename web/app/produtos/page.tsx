/**
 * Top produtos + curva ABC.
 *
 * Relatório de ITEM: depende de o sync ter trazido o detalhe dos pedidos. Se
 * não trouxe, o backend responde `itensNaoSincronizados` em vez de zeros, e a
 * tela mostra isso — "0 produtos" seria uma afirmação falsa sobre a loja.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { AbcChart, CLASS_COLOR } from "@/components/charts/AbcChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type ItemsNotSyncedResponse,
  type ProductRow,
  type ProductsReport,
} from "@/lib/types";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<ProductsReport | ItemsNotSyncedResponse>(
    "top-products",
    toApiQuery(filters),
  );

  if (!result.ok) {
    return <ErrorState error={result.error} hint={result.hint} />;
  }

  if (isItemsNotSynced(result.data)) {
    return (
      <NotSyncedState
        totalPedidos={result.data.totalPedidos}
        mensagem={result.data.mensagem}
      />
    );
  }

  const { produtos, totalPedidos } = result.data;

  if (produtos.length === 0) {
    return <EmptyState title="Nenhum produto vendido neste período." />;
  }

  const receitaTotal = produtos.reduce((sum, p) => sum + p.receita, 0);
  const classeA = produtos.filter((p) => p.classe === "A");
  const receitaA = classeA.reduce((sum, p) => sum + p.receita, 0);

  const columns: Array<Column<ProductRow>> = [
    {
      key: "classe",
      header: "Classe",
      // A classe é texto + cor, nunca cor sozinha.
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: CLASS_COLOR[p.classe] }}
          />
          {p.classe}
        </span>
      ),
    },
    {
      key: "nome",
      header: "Produto",
      render: (p) => <span className="text-ink">{p.nome}</span>,
    },
    {
      key: "receita",
      header: "Receita",
      numeric: true,
      render: (p) => formatMoney(p.receita),
    },
    {
      key: "quantidade",
      header: "Qtd.",
      numeric: true,
      render: (p) => formatInt(p.quantidade),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (p) => formatInt(p.pedidos),
    },
    {
      key: "acumulado",
      header: "% acum.",
      numeric: true,
      render: (p) => formatPercent(p.percentualAcumulado),
    },
  ];

  return (
    <div className="space-y-4">
      <ExportBar page="/produtos" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Receita em produtos"
          value={formatMoney(receitaTotal)}
          context={`${formatInt(totalPedidos)} pedidos analisados`}
          contextInTooltip
          emphasis
        />
        <StatTile
          label="Produtos distintos"
          value={formatInt(produtos.length)}
          context="Agrupados por produto, não por SKU"
          contextInTooltip
        />
        <StatTile
          label="Concentração (classe A)"
          value={formatInt(classeA.length)}
          context={`${formatInt(classeA.length)} produtos = ${formatMoney(receitaA)} de receita`}
          contextInTooltip
        />
      </dl>

      <Card
        title="Curva ABC por receita"
        hint="Classe A concentra até 80% da receita; B vai até 95%; C é a cauda."
      >
        <AbcChart linhas={produtos} campoChave="productId" substantivo="produtos" />
      </Card>

      <Card
        title="Todos os produtos do período"
        hint="Ordenado por receita, do maior para o menor."
      >
        <DataTable
          caption="Produtos por receita, com classe ABC e percentual acumulado"
          columns={columns}
          rows={produtos}
          rowKey={(p) => p.productId}
          footer={
            <tr>
              <td className="px-3 py-2 text-left" colSpan={2}>
                Total
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(receitaTotal)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(produtos.reduce((s, p) => s + p.quantidade, 0))}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
            </tr>
          }
        />
      </Card>
    </div>
  );
}

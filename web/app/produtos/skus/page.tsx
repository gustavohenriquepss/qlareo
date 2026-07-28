/**
 * SKUs vendidos + curva ABC.
 *
 * Irmã de `/produtos`, com a chave trocada: uma linha por VARIAÇÃO em vez de
 * uma por produto. Existe porque as duas perguntas são diferentes e a tela de
 * produto, por construção, apaga a segunda:
 *
 *   /produtos      → o que comprar e o que descontinuar (sortimento)
 *   /produtos/skus → qual tamanho encalha e qual vive em ruptura (estoque)
 *
 * Um produto classe A pode ser um P que não sai somado a um M que esgota toda
 * semana. Na tela de produto isso é uma linha só, e a diferença desaparece.
 *
 * Relatório de ITEM: depende de o sync ter trazido o detalhe dos pedidos. Se não
 * trouxe, o backend responde `itensNaoSincronizados` em vez de zeros — "0 SKUs"
 * seria uma afirmação falsa sobre a loja.
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
  type SkuRow,
  type SkusReport,
} from "@/lib/types";

export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<SkusReport | ItemsNotSyncedResponse>(
    "top-skus",
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

  const { skus, totalPedidos } = result.data;

  if (skus.length === 0) {
    return <EmptyState title="Nenhum SKU vendido neste período." />;
  }

  const receitaTotal = skus.reduce((sum, s) => sum + s.receita, 0);
  const unidades = skus.reduce((sum, s) => sum + s.quantidade, 0);
  const classeA = skus.filter((s) => s.classe === "A");
  // Quantos PRODUTOS distintos estão por trás desses SKUs: é a comparação que
  // justifica a tela existir ao lado de /produtos.
  const produtosDistintos = new Set(skus.map((s) => s.productId)).size;

  const columns: Array<Column<SkuRow>> = [
    {
      key: "classe",
      header: "Classe",
      // A classe é texto + cor, nunca cor sozinha.
      render: (s) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: CLASS_COLOR[s.classe] }}
          />
          {s.classe}
        </span>
      ),
    },
    {
      key: "nome",
      header: "SKU",
      render: (s) => <span className="text-ink">{s.nome}</span>,
    },
    {
      key: "skuId",
      header: "Código",
      // O código fica VISÍVEL aqui (na tela de produto ele só vai no CSV):
      // quem abre esta tela está com o estoque na frente, e o código é como
      // o SKU é chamado no ERP e no coletor.
      render: (s) => (
        <span className="tnum text-ink-secondary">{s.skuId}</span>
      ),
    },
    {
      key: "receita",
      header: "Receita",
      numeric: true,
      render: (s) => formatMoney(s.receita),
    },
    {
      key: "quantidade",
      header: "Qtd.",
      numeric: true,
      render: (s) => formatInt(s.quantidade),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (s) => formatInt(s.pedidos),
    },
    {
      key: "acumulado",
      header: "% acum.",
      numeric: true,
      render: (s) => formatPercent(s.percentualAcumulado),
    },
  ];

  return (
    <div className="space-y-4">
      <ExportBar page="/produtos/skus" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Receita em SKUs"
          value={formatMoney(receitaTotal)}
          context={`${formatInt(totalPedidos)} pedidos analisados`}
          emphasis
        />
        <StatTile
          label="SKUs distintos"
          value={formatInt(skus.length)}
          context={`Em ${formatInt(produtosDistintos)} produtos`}
        />
        <StatTile
          label="Unidades vendidas"
          value={formatInt(unidades)}
          context={`${formatInt(classeA.length)} SKUs concentram até 80% da receita`}
        />
      </dl>

      <Card
        title="Curva ABC por receita de SKU"
        hint="A classificação é recalculada sobre a base de SKU — não é o recorte da classe do produto."
      >
        <AbcChart linhas={skus} campoChave="skuId" substantivo="SKUs" />
      </Card>

      <Card
        title="Todos os SKUs do período"
        hint="Ordenado por receita, do maior para o menor."
      >
        <DataTable
          caption="SKUs por receita, com classe ABC e percentual acumulado"
          columns={columns}
          rows={skus}
          rowKey={(s) => s.skuId}
          footer={
            <tr>
              <td className="px-3 py-2 text-left" colSpan={3}>
                Total
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(receitaTotal)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(unidades)}
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

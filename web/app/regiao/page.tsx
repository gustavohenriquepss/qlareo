/**
 * Vendas por região (UF de entrega).
 *
 * Agrupa pelo endereço de ENTREGA, não de cobrança: a pergunta é "para onde
 * estou vendendo" — frete, estoque, campanha regional. Num presente as duas
 * respostas divergem, e a de entrega é a que interessa.
 *
 * Relatório de DETALHE: a UF vem do Get Order, o mesmo payload dos itens. Se o
 * período não foi sincronizado com `--items`, o backend responde
 * `itensNaoSincronizados` em vez de reportar 100% em "sem UF" — uma lacuna de
 * sincronismo com cara de dado é pior que nenhum dado.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { RankBarChart } from "@/components/charts/RankBarChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type ItemsNotSyncedResponse,
  type RegionReport,
  type RegionRow,
} from "@/lib/types";

/** Acima disso as barras viram tiras; a tabela abaixo tem tudo. */
const MAX_BARRAS = 12;

export default async function RegiaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<RegionReport | ItemsNotSyncedResponse>(
    "sales-by-region",
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

  const d = result.data;

  if (d.totalPedidos === 0) {
    return <EmptyState title="Nenhum pedido neste período." />;
  }

  // A linha "sem UF" fica FORA do gráfico e dentro da tabela: no ranking ela
  // competiria por espaço com uma UF de verdade, e não é uma região — é a
  // medida da cobertura do dado. O número dela vira nota abaixo do gráfico.
  const comUf = d.linhas.filter((l) => l.uf !== "Sem UF informada");
  const lider = comUf[0];

  const columns: Array<Column<RegionRow>> = [
    { key: "uf", header: "UF", render: (r) => r.uf },
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
      key: "ticketMedio",
      header: "Ticket médio",
      numeric: true,
      render: (r) => formatMoney(r.ticketMedio),
    },
    {
      key: "participacao",
      header: "% do período",
      numeric: true,
      render: (r) => formatPercent(r.participacao),
    },
  ];

  return (
    <div className="space-y-4">
      <ExportBar page="/regiao" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="UFs com venda"
          value={formatInt(comUf.length)}
          context={`${formatInt(d.totalPedidos)} pedidos no período`}
          emphasis
        />
        <StatTile
          label="Maior praça"
          value={lider ? lider.uf : "—"}
          context={
            lider
              ? `${formatMoney(lider.faturamento)} — ${formatPercent(lider.participacao)} do período`
              : "Nenhum pedido com UF informada"
          }
        />
        <StatTile
          label="Cobertura do dado"
          value={formatPercent(
            ((d.totalPedidos - d.pedidosSemRegiao) / d.totalPedidos) * 100,
          )}
          context={`${formatInt(d.pedidosSemRegiao)} pedidos sem UF (digital ou retirada)`}
        />
      </dl>

      <Card
        title="Faturamento por UF"
        hint="Ordenado por faturamento. Pedidos sem UF não entram no gráfico — estão na tabela."
      >
        {comUf.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhum pedido do período tem UF de entrega informada.
          </p>
        ) : (
          <>
            <RankBarChart
              rows={comUf.slice(0, MAX_BARRAS).map((l) => ({
                rotulo: l.uf,
                faturamento: l.faturamento,
                pedidos: l.pedidos,
              }))}
            />
            {comUf.length > MAX_BARRAS && (
              <p className="mt-2 text-xs text-ink-muted">
                Mostrando as {MAX_BARRAS} maiores. As {comUf.length} UFs do
                período estão na tabela abaixo.
              </p>
            )}
          </>
        )}
      </Card>

      <Card
        title="Todas as UFs do período"
        hint="Inclui a linha de pedidos sem UF, para a soma fechar com o faturamento."
      >
        <DataTable
          caption="Faturamento, pedidos e ticket médio por UF de entrega"
          columns={columns}
          rows={d.linhas}
          rowKey={(r) => r.uf}
          footer={
            <tr>
              <td className="px-3 py-2 text-left">Total</td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(d.totalFaturamento)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(d.totalPedidos)}
              </td>
              <td className="px-3 py-2" />
              <td className="tnum px-3 py-2 text-right">100%</td>
            </tr>
          }
        />
      </Card>
    </div>
  );
}

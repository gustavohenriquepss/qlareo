/**
 * Promoções › Por cupom.
 *
 * O desconto de `/promocoes` ganha um NOME aqui: qual cupom trouxe o pedido.
 * Mesma resposta de `coupons-and-sources` do recorte por origem — aqui só o
 * `porCupom`. Ver `app/promocoes/origem/page.tsx`.
 *
 * "Sem cupom" aparece como LINHA, e isso define a leitura: numa loja saudável
 * costuma ser a maior delas, e escondê-la faria os cupons de verdade parecerem
 * dominantes.
 */
import { AttributionTable, SEM_CUPOM } from "@/components/AttributionTable";
import { Card } from "@/components/Card";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type AttributionReport,
  type ItemsNotSyncedResponse,
} from "@/lib/types";

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<AttributionReport | ItemsNotSyncedResponse>(
    "coupons-and-sources",
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

  const cuponsReais = d.porCupom.filter((c) => c.chave !== SEM_CUPOM);

  return (
    <div className="space-y-4">
      <ExportBar page="/promocoes/cupons" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Faturamento com cupom"
          value={formatMoney(d.faturamentoComCupom)}
          context={`${formatInt(d.pedidosComCupom)} de ${formatInt(d.totalPedidos)} pedidos usaram cupom`}
          emphasis
        />
        <StatTile
          label="Cupons distintos"
          value={formatInt(cuponsReais.length)}
          context={
            cuponsReais.length > 0
              ? `Maior: ${cuponsReais[0].chave}`
              : "Nenhum cupom usado no período"
          }
        />
        <StatTile
          label="Peso do cupom"
          value={formatPercent(
            d.totalFaturamento > 0
              ? (d.faturamentoComCupom / d.totalFaturamento) * 100
              : 0,
          )}
          context="Quanto do faturamento do período passou por algum cupom"
        />
      </dl>

      <Card
        title="Por cupom"
        hint='"Sem cupom" é uma linha, não um buraco: normalmente é a maior delas.'
      >
        <AttributionTable
          header="Cupom"
          caption="Faturamento e pedidos por cupom"
          rows={d.porCupom}
          footer={
            <tr>
              <td className="px-3 py-2 text-left">Total</td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(d.totalFaturamento)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(d.totalPedidos)}
              </td>
              <td className="tnum px-3 py-2 text-right">100%</td>
            </tr>
          }
        />
      </Card>
    </div>
  );
}

/**
 * Cupons e origem (UTM).
 *
 * Complementa `/promocoes`, que sabe QUANTO de desconto foi dado mas não POR
 * QUÊ: aqui o desconto ganha um nome (o cupom) e uma origem (a campanha).
 *
 * "Sem cupom" e "Direto / não rastreado" aparecem como LINHAS, e isso define a
 * leitura da tela: numa loja saudável a maior costuma ser justamente "sem
 * cupom", e escondê-la faria a segunda parecer dominante. Também é o que impede
 * o erro de ler ausência de UTM como falha de sincronismo — a maioria dos
 * pedidos legitimamente não tem UTM nenhuma.
 *
 * Relatório de DETALHE: cupom e UTM vêm do Get Order, o mesmo payload dos itens.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type AttributionReport,
  type AttributionRow,
  type ItemsNotSyncedResponse,
} from "@/lib/types";

/** Rótulos que o backend usa para "não é um valor, é a ausência dele". */
const SEM_CUPOM = "Sem cupom";
const SEM_ORIGEM = "Direto / não rastreado";

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

export default async function OrigemPage({
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
  const origensReais = d.porOrigem.filter((o) => o.chave !== SEM_ORIGEM);
  const rastreado = origensReais.reduce((s, o) => s + o.faturamento, 0);

  return (
    <div className="space-y-4">
      <ExportBar page="/origem" filters={filters} />

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
          label="Faturamento rastreado"
          value={formatPercent(
            d.totalFaturamento > 0 ? (rastreado / d.totalFaturamento) * 100 : 0,
          )}
          context="O resto veio de tráfego direto ou sem UTM"
        />
      </dl>

      <Card
        title="Por cupom"
        hint='"Sem cupom" é uma linha, não um buraco: normalmente é a maior delas.'
      >
        <DataTable
          caption="Faturamento e pedidos por cupom"
          columns={colunas("Cupom")}
          rows={d.porCupom}
          rowKey={(r) => r.chave}
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

      <Card
        title="Por origem"
        hint="De onde veio a sessão que gerou o pedido (utm_source)."
      >
        <DataTable
          caption="Faturamento e pedidos por origem de tráfego"
          columns={colunas("Origem")}
          rows={d.porOrigem}
          rowKey={(r) => r.chave}
        />
      </Card>

      <Card
        title="Por campanha"
        hint="Campanha registrada no pedido (utm_campaign)."
      >
        <DataTable
          caption="Faturamento e pedidos por campanha"
          columns={colunas("Campanha")}
          rows={d.porCampanha}
          rowKey={(r) => r.chave}
        />
      </Card>

      {/* A limitação vem do backend como texto, não como regra da tela: quem
          sabe o que a atribuição significa é quem a calcula. */}
      <p className="text-xs text-ink-muted">{d.observacao}</p>
    </div>
  );
}

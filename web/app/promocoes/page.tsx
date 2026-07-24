/**
 * Efetividade de promoções.
 *
 * O relatório responde duas coisas e não finge responder uma terceira: quanto
 * de receita andou com desconto, e quanto o desconto custou. Ele NÃO atribui
 * desconto a uma promoção específica (várias incidem no mesmo item), e a
 * `observacao` do core, mostrada na tela, diz isso na cara.
 *
 * Também é relatório de ITEM: sem sync de itens, mostra o estado, não zeros.
 */
import { Card } from "@/components/Card";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { ProportionBar } from "@/components/charts/ProportionBar";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type ItemsNotSyncedResponse,
  type PromoReport,
} from "@/lib/types";

export default async function PromocoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<PromoReport | ItemsNotSyncedResponse>(
    "promotions",
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

  const report = result.data;

  if (report.pedidosAnalisados === 0) {
    return <EmptyState />;
  }

  const semDesconto = Math.max(
    report.pedidosAnalisados - report.pedidosComDesconto,
    0,
  );
  const pctPedidosComDesconto =
    report.pedidosAnalisados > 0
      ? (report.pedidosComDesconto / report.pedidosAnalisados) * 100
      : 0;

  return (
    <div className="space-y-4">
      <ExportBar page="/promocoes" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Desconto concedido"
          value={formatMoney(report.descontoTotal)}
          context="Preço de lista menos preço pago"
          emphasis
        />
        <StatTile
          label="Desconto médio"
          value={formatPercent(report.percentualDescontoMedio)}
          context="Sobre a receita bruta sem desconto"
        />
        <StatTile
          label="Receita líquida"
          value={formatMoney(report.receitaLiquida)}
          context={`Bruta: ${formatMoney(report.receitaBrutaSemDesconto)}`}
        />
        <StatTile
          label="Pedidos com desconto"
          value={formatInt(report.pedidosComDesconto)}
          context={`de ${formatInt(report.pedidosAnalisados)} analisados`}
        />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Onde foi a receita bruta"
          hint="A receita bruta é a soma dos preços de lista. O desconto é a parte que não virou caixa."
        >
          <ProportionBar
            segments={[
              {
                label: "Receita líquida",
                value: report.receitaLiquida,
                color: "var(--series-1)",
                display: formatMoney(report.receitaLiquida),
              },
              {
                label: "Desconto",
                value: report.descontoTotal,
                color: "var(--series-2)",
                display: formatMoney(report.descontoTotal),
              },
            ]}
          />
        </Card>

        <Card
          title="Alcance da promoção"
          hint="Quantos pedidos do período levaram algum desconto."
        >
          <ProportionBar
            segments={[
              {
                label: "Com desconto",
                value: report.pedidosComDesconto,
                color: "var(--series-2)",
                display: `${formatInt(report.pedidosComDesconto)} (${formatPercent(pctPedidosComDesconto)})`,
              },
              {
                label: "Sem desconto",
                value: semDesconto,
                color: "var(--series-1)",
                display: `${formatInt(semDesconto)} (${formatPercent(100 - pctPedidosComDesconto)})`,
              },
            ]}
          />
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-2 px-3 py-3">
        <svg
          className="mt-0.5 shrink-0 text-ink-muted"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-xs leading-relaxed text-ink-secondary">
          {report.observacao}
        </p>
      </div>
    </div>
  );
}

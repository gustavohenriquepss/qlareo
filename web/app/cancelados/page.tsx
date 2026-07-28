/**
 * Pedidos cancelados.
 *
 * A única tela do app que NÃO respeita o recorte de vendas — e não por descuido.
 * "Líquido", o recorte default, existe justamente para remover cancelados do
 * faturamento; aplicá-lo aqui devolveria uma tela vazia sempre. O backend ignora
 * o parâmetro nesta rota e a `FilterBar` esconde o controle, para que a
 * interface não ofereça um filtro que ela não obedece.
 *
 * NENHUM número desta tela se chama "faturamento". Este dinheiro não entrou: o
 * campo é `valorCancelado`, e o rótulo diz "valor cancelado". A distinção deixa
 * de ser cosmética no momento em que alguém exporta os dois CSVs para a mesma
 * planilha.
 *
 * Relatório barato: só o cabeçalho do pedido, sem depender de `--items`.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { SalesTrendChart } from "@/components/charts/SalesTrendChart";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";
import type { CanceledReport } from "@/lib/types";

/**
 * Os status crus da VTEX não são autoexplicativos para quem abre o relatório.
 * O código continua visível ao lado — é ele que aparece no Admin e num chamado
 * de suporte —, mas a frase é o que responde "e daí?".
 */
const EXPLICACAO: Record<string, string> = {
  canceled: "Cancelamento concluído",
  "cancellation-requested": "Cancelamento pedido, ainda em curso",
};

export default async function CanceladosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<CanceledReport>(
    "canceled-orders",
    toApiQuery(filters),
  );

  if (!result.ok) {
    return <ErrorState error={result.error} hint={result.hint} />;
  }

  const d = result.data;

  // Nenhum pedido no período é diferente de nenhum cancelamento: o segundo é
  // uma boa notícia, e dizer "sem dados" a quem não teve cancelamento nenhum
  // esconde exatamente a informação que ele queria.
  if (d.pedidosNoPeriodo === 0) {
    return <EmptyState title="Nenhum pedido neste período." />;
  }
  if (d.totalPedidos === 0) {
    return (
      <EmptyState
        title={`Nenhum cancelamento entre os ${formatInt(d.pedidosNoPeriodo)} pedidos do período.`}
      />
    );
  }

  const statusColumns: Array<Column<CanceledReport["porStatus"][number]>> = [
    {
      key: "status",
      header: "Situação",
      render: (r) => (
        <span className="flex flex-col">
          <span className="text-ink">{EXPLICACAO[r.status] ?? r.status}</span>
          {EXPLICACAO[r.status] && (
            <span className="text-xs text-ink-muted">{r.status}</span>
          )}
        </span>
      ),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (r) => formatInt(r.pedidos),
    },
    {
      key: "valor",
      header: "Valor cancelado",
      numeric: true,
      render: (r) => formatMoney(r.valor),
    },
  ];

  const pagamentoColumns: Array<
    Column<CanceledReport["porPagamento"][number]>
  > = [
    { key: "metodo", header: "Meio de pagamento", render: (r) => r.metodo },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (r) => formatInt(r.pedidos),
    },
    {
      key: "valor",
      header: "Valor cancelado",
      numeric: true,
      render: (r) => formatMoney(r.valor),
    },
  ];

  const somaPagamento = d.porPagamento.reduce((s, p) => s + p.valor, 0);

  return (
    <div className="space-y-4">
      <ExportBar page="/cancelados" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Taxa de cancelamento"
          value={formatPercent(d.taxa)}
          context={`${formatInt(d.totalPedidos)} de ${formatInt(d.pedidosNoPeriodo)} pedidos do período`}
          emphasis
        />
        <StatTile
          label="Valor cancelado"
          value={formatMoney(d.valorCancelado)}
          context="Não entrou no faturamento — nem no bruto"
        />
        <StatTile
          label="Pedidos cancelados"
          value={formatInt(d.totalPedidos)}
          context={`Em ${formatInt(d.linhas.length)} dias com cancelamento`}
        />
      </dl>

      <Card
        title="Cancelamentos ao longo do período"
        hint="Um pico isolado é um incidente; um patamar constante é um processo."
      >
        <SalesTrendChart
          rows={d.linhas}
          grain={filters.grain}
          campoValor="valor"
          rotuloValor="Valor cancelado"
        />
      </Card>

      <Card
        title="Por situação"
        hint="Cancelamento concluído e cancelamento em curso pedem ações diferentes."
      >
        <DataTable
          caption="Pedidos cancelados por situação do workflow"
          columns={statusColumns}
          rows={d.porStatus}
          rowKey={(r) => r.status}
        />
      </Card>

      <Card
        title="Por meio de pagamento"
        hint="Um meio concentrando cancelamento costuma ser problema de gateway, não de demanda."
      >
        {d.porPagamento.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhum dos pedidos cancelados tem meio de pagamento informado.
          </p>
        ) : (
          <DataTable
            caption="Pedidos cancelados por meio de pagamento"
            columns={pagamentoColumns}
            rows={d.porPagamento}
            rowKey={(r) => r.metodo}
            footer={
              <tr>
                <td className="px-3 py-2 text-left">Soma da lista</td>
                <td className="tnum px-3 py-2 text-right">
                  {formatInt(
                    d.porPagamento.reduce((s, p) => s + p.pedidos, 0),
                  )}
                </td>
                <td className="tnum px-3 py-2 text-right">
                  {formatMoney(somaPagamento)}
                </td>
              </tr>
            }
          />
        )}
        {/* Mesma razão do rodapé "Soma da lista" em RankSection: pedido sem
            meio de pagamento informado não entra em nenhuma linha, e esconder
            a diferença faria o usuário desconfiar dos dois números. */}
        {somaPagamento !== d.valorCancelado && d.porPagamento.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            A soma da lista é menor que o valor cancelado do período: pedidos sem
            meio de pagamento informado não entram em nenhuma linha.
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * Novos vs. recorrentes.
 *
 * O relatório vem com um `aviso` do core sobre a janela de ~24 meses da API. A
 * UI mostra esse aviso SEMPRE, junto do número, e não escondido num rodapé:
 * "taxa de recompra 18%" sem a ressalva de que clientes antigos podem ser
 * contados como novos é um número que induz a erro.
 */
import { Card } from "@/components/Card";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { ProportionBar } from "@/components/charts/ProportionBar";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatISODate, formatPercent } from "@/lib/format";
import type { RetentionReport } from "@/lib/types";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchReport<RetentionReport>(
    "new-vs-returning",
    toApiQuery(filters),
  );

  if (!result.ok) {
    return <ErrorState error={result.error} hint={result.hint} />;
  }

  const report = result.data;
  const total = report.novos + report.recorrentes;

  if (total === 0) {
    return (
      <EmptyState title="Nenhum cliente identificado neste período.">
        <p>
          Ou não houve pedidos, ou os pedidos do período vieram sem e-mail do
          cliente — sem essa chave não dá para dizer quem é novo e quem voltou.
        </p>
      </EmptyState>
    );
  }

  const periodo = `${formatISODate(filters.from)} a ${formatISODate(filters.to)}`;

  return (
    <div className="space-y-4">
      <ExportBar page="/clientes" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Taxa de recompra"
          value={formatPercent(report.taxaRecompra)}
          context="Clientes que compraram mais de uma vez"
          emphasis
        />
        <StatTile
          label="Clientes novos"
          value={formatInt(report.novos)}
          context="Um único pedido na janela"
        />
        <StatTile
          label="Clientes recorrentes"
          value={formatInt(report.recorrentes)}
          context="Dois ou mais pedidos na janela"
        />
      </dl>

      <Card
        title="Composição da base no período"
        hint={`${formatInt(total)} clientes identificados entre ${periodo}.`}
      >
        <ProportionBar
          segments={[
            {
              label: "Novos",
              value: report.novos,
              color: "var(--series-1)",
              display: `${formatInt(report.novos)} (${formatPercent(
                (report.novos / total) * 100,
              )})`,
            },
            {
              label: "Recorrentes",
              value: report.recorrentes,
              color: "var(--series-2)",
              display: `${formatInt(report.recorrentes)} (${formatPercent(
                (report.recorrentes / total) * 100,
              )})`,
            },
          ]}
        />

        <div className="mt-6 flex items-start gap-3 rounded-md border border-warning/40 bg-surface-2 px-3 py-3">
          <svg
            className="mt-0.5 shrink-0 text-warning"
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
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-xs leading-relaxed text-ink-secondary">
            {report.aviso}
          </p>
        </div>
      </Card>
    </div>
  );
}

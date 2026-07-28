/**
 * Promoções › Por origem e campanha (UTM).
 *
 * De onde veio o pedido: a origem da sessão (utm_source) e a campanha
 * (utm_campaign). Mesma resposta de `coupons-and-sources` do recorte por cupom —
 * aqui só `porOrigem` e `porCampanha`. Ver `app/promocoes/cupons/page.tsx`.
 *
 * "Direto / não rastreado" aparece como LINHA, e isso define a leitura da tela:
 * a maioria dos pedidos legitimamente não tem UTM nenhuma, então escondê-la faria
 * a segunda origem parecer dominante — e leria a ausência de UTM como falha de
 * sincronismo, que não é.
 *
 * Relatório de DETALHE: a UTM vem do Get Order, o mesmo payload dos itens.
 */
import { AttributionTable, SEM_ORIGEM } from "@/components/AttributionTable";
import { Card } from "@/components/Card";
import { ExportBar } from "@/components/ExportBar";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatPercent } from "@/lib/format";
import {
  isItemsNotSynced,
  type AttributionReport,
  type ItemsNotSyncedResponse,
} from "@/lib/types";

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

  const origensReais = d.porOrigem.filter((o) => o.chave !== SEM_ORIGEM);
  const campanhasReais = d.porCampanha.filter((c) => c.chave !== SEM_ORIGEM);
  const rastreado = origensReais.reduce((s, o) => s + o.faturamento, 0);

  return (
    <div className="space-y-4">
      <ExportBar page="/promocoes/origem" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Faturamento rastreado"
          value={formatPercent(
            d.totalFaturamento > 0 ? (rastreado / d.totalFaturamento) * 100 : 0,
          )}
          context="O resto veio de tráfego direto ou sem UTM"
          emphasis
        />
        <StatTile
          label="Origens distintas"
          value={formatInt(origensReais.length)}
          context={
            origensReais.length > 0
              ? `Maior: ${origensReais[0].chave}`
              : "Nenhuma origem rastreada no período"
          }
        />
        <StatTile
          label="Campanhas distintas"
          value={formatInt(campanhasReais.length)}
          context={
            campanhasReais.length > 0
              ? `Maior: ${campanhasReais[0].chave}`
              : "Nenhuma campanha rastreada no período"
          }
        />
      </dl>

      <Card
        title="Por origem"
        hint="De onde veio a sessão que gerou o pedido (utm_source)."
      >
        <AttributionTable
          header="Origem"
          caption="Faturamento e pedidos por origem de tráfego"
          rows={d.porOrigem}
        />
      </Card>

      <Card
        title="Por campanha"
        hint="Campanha registrada no pedido (utm_campaign)."
      >
        <AttributionTable
          header="Campanha"
          caption="Faturamento e pedidos por campanha"
          rows={d.porCampanha}
        />
      </Card>

      {/* A limitação vem do backend como texto, não como regra da tela: quem
          sabe o que a atribuição significa é quem a calcula. */}
      <p className="text-xs text-ink-muted">{d.observacao}</p>
    </div>
  );
}

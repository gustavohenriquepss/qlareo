import { Badge, cardClasses } from "@/components/ui/card";
import type { ArtworkRow } from "@/lib/artes";
import { ArtworkPanel } from "./artes/artwork-panel";
import { bagsLabel, periodLabel, SIDES_LABEL, STATUS_LABEL, statusTone, type Sides, type Status } from "@/lib/campanhas";

export type ReportCampaign = {
  id: string;
  name: string;
  sides: Sides;
  status: Status;
  destination_url: string;
  starts_on: string | null;
  ends_on: string | null;
  scans: { count: number }[];
  campaign_restaurants: {
    id: string;
    bags: number;
    restaurants: { name: string; city: string; neighborhood: string | null } | null;
  }[];
  artworks: ArtworkRow[];
};

const place = (r: { city: string; neighborhood: string | null }) => [r.neighborhood, r.city].filter(Boolean).join(", ");

/**
 * Relatório de uma campanha para o anunciante: as leituras do QR (da campanha
 * inteira, porque o QR é o mesmo em todas as sacolas) e quantas sacolas foram
 * para cada restaurante. Não divide leitura por restaurante: esse dado não
 * existe, e um número estimado aqui seria inventado.
 */
export function CampaignReport({ campaign: c }: { campaign: ReportCampaign }) {
  const scans = c.scans[0]?.count ?? 0;
  const rows = [...c.campaign_restaurants].sort((a, b) => b.bags - a.bags);
  const bags = rows.reduce((sum, r) => sum + r.bags, 0);
  const headingId = `campanha-${c.id}`;
  // Enquanto a campanha espera arte, o envio é o que importa e vem antes dos números.
  const artFirst = c.status === "aguardando_arte";
  const art = (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-ink">Arte da sacola</h3>
      <ArtworkPanel campaign={c} artworks={c.artworks} mode="anunciante" />
    </div>
  );

  return (
    <section aria-labelledby={headingId} className={`${cardClasses} flex flex-col gap-6 p-5 sm:p-6`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-lg font-semibold text-ink">
            {c.name}
          </h2>
          <Badge tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Badge>
        </div>
        <p className="text-sm text-ink-muted">
          {SIDES_LABEL[c.sides]} · {periodLabel(c.starts_on, c.ends_on)}
        </p>
      </div>

      {artFirst ? art : null}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
          <dt className="text-sm text-ink-secondary">Leituras do QR</dt>
          <dd className="tnum text-3xl font-semibold tracking-tight text-ink">{scans.toLocaleString("pt-BR")}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
          <dt className="text-sm text-ink-secondary">Sacolas distribuídas</dt>
          <dd className="tnum text-3xl font-semibold tracking-tight text-ink">{bags.toLocaleString("pt-BR")}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold text-ink">Onde as sacolas rodaram</h3>
        {rows.length ? (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {rows.map((r) => {
              const share = bags ? Math.round((r.bags / bags) * 100) : 0;
              return (
                <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{r.restaurants?.name}</p>
                      <p className="text-sm text-ink-muted">{r.restaurants ? place(r.restaurants) : null}</p>
                    </div>
                    <p className="tnum shrink-0 text-right text-sm text-ink-secondary">
                      <span className="font-semibold text-ink">{bagsLabel(r.bags)}</span>
                      {bags ? <span className="block text-ink-muted">{share}% do total</span> : null}
                    </p>
                  </div>
                  {bags ? (
                    <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(r.bags / bags) * 100}%` }} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-secondary">Os restaurantes aparecem aqui quando as sacolas forem distribuídas.</p>
        )}
      </div>

      {/* Campanha que já saiu de "aguardando arte" sem versão no painel (arte combinada por
          fora, antes desta tela existir): não há o que mostrar nem o que pedir. */}
      {artFirst || !c.artworks.length ? null : art}

      <p className="text-sm text-ink-muted">
        O QR é o mesmo em todas as sacolas, então as leituras são da campanha inteira, não de cada restaurante.
        Ele leva para{" "}
        <a href={c.destination_url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary hover:text-primary-hover">
          {c.destination_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
        .
      </p>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Card, cardClasses } from "@/components/ui/card";
import {
  isUuid,
  periodLabel,
  placementLabel,
  STATUS_LABEL,
  statusTone,
  type Plan,
  type Side,
  type Status,
} from "@/lib/campanhas";
import { qrSvg, scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import { addRestaurants, removeRestaurant, updateCampaign } from "../../actions";
import { EmptyState, PageHeading } from "../../ui";
import { advertiserOptions, operatorAdvertisers } from "../advertisers";
import { CampaignForm } from "../campaign-form";
import { AddRestaurantsForm } from "./add-restaurants-form";

type Campaign = {
  id: string;
  advertiser_id: string;
  name: string;
  plan: Plan;
  side: Side | null;
  status: Status;
  destination_url: string;
  starts_on: string | null;
  ends_on: string | null;
  advertisers: { name: string } | null;
};

type Qr = {
  id: string;
  slug: string;
  restaurants: { id: string; name: string; city: string; neighborhood: string | null } | null;
  scans: { count: number }[];
};

type Restaurant = { id: string; name: string; city: string; neighborhood: string | null };

const place = (r: { city: string; neighborhood: string | null }) => [r.neighborhood, r.city].filter(Boolean).join(", ");

export default async function CampanhaPage({ params }: PageProps<"/painel/operacao/campanhas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [campaign, qrs, restaurants, advertisers, origin] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, advertiser_id, name, plan, side, status, destination_url, starts_on, ends_on, advertisers(name)")
      .eq("id", id)
      .maybeSingle<Campaign>(),
    supabase
      .from("campaign_restaurants")
      .select("id, slug, restaurants(id, name, city, neighborhood), scans(count)")
      .eq("campaign_id", id)
      .order("created_at")
      .returns<Qr[]>(),
    supabase.from("restaurants").select("id, name, city, neighborhood").order("city").order("name").returns<Restaurant[]>(),
    operatorAdvertisers(supabase),
    requestOrigin(),
  ]);
  if (campaign.error) throw campaign.error;
  if (!campaign.data) notFound();
  if (qrs.error) throw qrs.error;
  if (restaurants.error) throw restaurants.error;

  const c = campaign.data;
  const linked = new Set(qrs.data.map((q) => q.restaurants?.id));
  const available = restaurants.data.filter((r) => !linked.has(r.id));
  const codes = await Promise.all(
    qrs.data.map(async (q) => {
      const url = scanUrl(q.slug, origin);
      return { ...q, url, svg: await qrSvg(url), scans: q.scans[0]?.count ?? 0 };
    }),
  );

  return (
    <>
      <PageHeading
        title={c.name}
        back={{ href: "/painel/operacao/campanhas", label: "Campanhas" }}
        lead={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{c.advertisers?.name}</span>
            <span aria-hidden>·</span>
            <span>{placementLabel(c.plan, c.side)}</span>
            <span aria-hidden>·</span>
            <span>{periodLabel(c.starts_on, c.ends_on)}</span>
            <Badge tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Badge>
          </span>
        }
      />

      <section aria-labelledby="qr-codes" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="qr-codes" className="text-lg font-semibold text-ink">
            QR codes por restaurante
          </h2>
          <p className="max-w-prose text-sm text-ink-secondary">
            Cada restaurante tem o próprio QR, para saber de onde veio cada leitura. Todos levam para{" "}
            <a href={c.destination_url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary hover:text-primary-hover">
              {c.destination_url}
            </a>
            . Mande o SVG para a gráfica; o PNG é para conferir ou usar em outro lugar.
          </p>
        </div>

        {codes.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {codes.map((q) => (
              <li key={q.id} className={`${cardClasses} flex min-w-0 gap-4 p-4`}>
                <div
                  role="img"
                  aria-label={`QR code de ${q.restaurants?.name}`}
                  className="size-28 shrink-0 [&>svg]:size-full"
                  // SVG gerado aqui no servidor a partir do nosso próprio link.
                  dangerouslySetInnerHTML={{ __html: q.svg }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{q.restaurants?.name}</p>
                    <p className="text-sm text-ink-muted">{q.restaurants ? place(q.restaurants) : null}</p>
                  </div>
                  <p className="truncate font-mono text-xs text-ink-secondary" title={q.url}>
                    {q.url.replace(/^https?:\/\//, "")}
                  </p>
                  <p className="text-sm text-ink-secondary">
                    {q.scans === 0 ? "Nenhuma leitura" : q.scans === 1 ? "1 leitura" : `${q.scans.toLocaleString("pt-BR")} leituras`}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <a href={`/painel/qr/${q.id}`} download className={buttonClasses({ size: "sm", variant: "secondary" })}>
                      SVG
                    </a>
                    <a href={`/painel/qr/${q.id}?formato=png`} download className={buttonClasses({ size: "sm", variant: "secondary" })}>
                      PNG
                    </a>
                    {q.scans === 0 ? (
                      <form action={removeRestaurant.bind(null, q.id)}>
                        <Button
                          type="submit"
                          size="sm"
                          variant="secondary"
                          className="text-negative"
                          aria-label={`Tirar ${q.restaurants?.name} da campanha`}
                        >
                          Tirar
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhum restaurante nesta campanha">
            Marque abaixo os restaurantes onde as sacolas vão circular. Cada um ganha um QR code.
          </EmptyState>
        )}

        <Card aria-labelledby="adicionar">
          <h3 id="adicionar" className="mb-4 font-semibold text-ink">
            Adicionar restaurantes
          </h3>
          {available.length ? (
            <AddRestaurantsForm
              action={addRestaurants.bind(null, c.id)}
              restaurants={available.map((r) => ({ id: r.id, name: r.name, place: place(r) }))}
            />
          ) : (
            <p className="text-ink-secondary">
              {restaurants.data.length ? "Todos os restaurantes da rede já estão nesta campanha. " : "Nenhum restaurante cadastrado ainda. "}
              <Link href="/painel/operacao/restaurantes" className="font-semibold text-primary hover:text-primary-hover">
                Cadastrar restaurante
              </Link>
            </p>
          )}
        </Card>
      </section>

      <Card aria-labelledby="dados">
        <h2 id="dados" className="mb-4 text-lg font-semibold text-ink">
          Dados da campanha
        </h2>
        <CampaignForm
          action={updateCampaign.bind(null, c.id)}
          advertisers={advertiserOptions(advertisers)}
          initial={c}
          withStatus
          submitLabel="Salvar campanha"
        />
      </Card>
    </>
  );
}

/** Origem desta requisição, para o QR apontar para a máquina no `npm run dev`. */
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

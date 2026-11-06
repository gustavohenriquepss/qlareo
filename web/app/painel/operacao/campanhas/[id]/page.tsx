import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, cardClasses } from "@/components/ui/card";
import {
  isUuid,
  periodLabel,
  scansLabel,
  SIDES_LABEL,
  STATUS_LABEL,
  statusTone,
  type Sides,
  type Status,
} from "@/lib/campanhas";
import { qrSvg, scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import { addRestaurants, removeRestaurant, updateBags, updateCampaign } from "../../actions";
import { EmptyState, PageHeading } from "../../ui";
import { advertiserOptions, operatorAdvertisers } from "../advertisers";
import { CampaignForm } from "../campaign-form";
import { AddRestaurantsForm } from "./add-restaurants-form";
import { BagsForm } from "./bags-form";

type Campaign = {
  id: string;
  advertiser_id: string;
  name: string;
  slug: string;
  sides: Sides;
  status: Status;
  destination_url: string;
  starts_on: string | null;
  ends_on: string | null;
  advertisers: { name: string } | null;
  scans: { count: number }[];
};

type CampaignRestaurant = {
  id: string;
  bags: number;
  restaurants: { id: string; name: string; city: string; neighborhood: string | null } | null;
};

type Restaurant = { id: string; name: string; city: string; neighborhood: string | null };

const place = (r: { city: string; neighborhood: string | null }) => [r.neighborhood, r.city].filter(Boolean).join(", ");

export default async function CampanhaPage({ params }: PageProps<"/painel/operacao/campanhas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [campaign, links, restaurants, advertisers, origin] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, advertiser_id, name, slug, sides, status, destination_url, starts_on, ends_on, advertisers(name), scans(count)")
      .eq("id", id)
      .maybeSingle<Campaign>(),
    supabase
      .from("campaign_restaurants")
      .select("id, bags, restaurants(id, name, city, neighborhood)")
      .eq("campaign_id", id)
      .order("created_at")
      .returns<CampaignRestaurant[]>(),
    supabase.from("restaurants").select("id, name, city, neighborhood").order("city").order("name").returns<Restaurant[]>(),
    operatorAdvertisers(supabase),
    requestOrigin(),
  ]);
  if (campaign.error) throw campaign.error;
  if (!campaign.data) notFound();
  if (links.error) throw links.error;
  if (restaurants.error) throw restaurants.error;

  const c = campaign.data;
  const linked = new Set(links.data.map((l) => l.restaurants?.id));
  const available = restaurants.data.filter((r) => !linked.has(r.id));
  const url = scanUrl(c.slug, origin);
  const svg = await qrSvg(url);
  const scans = c.scans[0]?.count ?? 0;

  return (
    <>
      <PageHeading
        title={c.name}
        back={{ href: "/painel/operacao/campanhas", label: "Campanhas" }}
        lead={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{c.advertisers?.name}</span>
            <span aria-hidden>·</span>
            <span>{SIDES_LABEL[c.sides]}</span>
            <span aria-hidden>·</span>
            <span>{periodLabel(c.starts_on, c.ends_on)}</span>
            <Badge tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Badge>
          </span>
        }
      />

      <section aria-labelledby="qr-code" className={`${cardClasses} flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:p-6`}>
        <div
          role="img"
          aria-label={`QR code da campanha ${c.name}`}
          className="size-36 shrink-0 self-center sm:self-start [&>svg]:size-full"
          // SVG gerado aqui no servidor a partir do nosso próprio link.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="qr-code" className="text-lg font-semibold text-ink">
              QR code da campanha
            </h2>
            <p className="max-w-prose text-sm text-ink-secondary">
              O mesmo QR vai em todas as sacolas da campanha e leva para{" "}
              <a href={c.destination_url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary hover:text-primary-hover">
                {c.destination_url}
              </a>
              . Mande o SVG para a gráfica; o PNG é para conferir ou usar em outro lugar.
            </p>
          </div>
          <p className="truncate font-mono text-xs text-ink-secondary" title={url}>
            {url.replace(/^https?:\/\//, "")}
          </p>
          <p className="text-sm font-medium text-ink">{scansLabel(scans)}</p>
          <div className="mt-auto flex flex-wrap gap-2">
            <a href={`/painel/qr/${c.id}`} download className={buttonClasses({ size: "sm", variant: "secondary" })}>
              Baixar SVG
            </a>
            <a href={`/painel/qr/${c.id}?formato=png`} download className={buttonClasses({ size: "sm", variant: "secondary" })}>
              Baixar PNG
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="restaurantes" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="restaurantes" className="text-lg font-semibold text-ink">
            Sacolas por restaurante
          </h2>
          <p className="max-w-prose text-sm text-ink-secondary">
            Anote quantas sacolas da campanha foram para cada restaurante. O anunciante vê esses números e o
            total de leituras: é assim que ele sabe onde a sacola rodou.
          </p>
        </div>

        {links.data.length ? (
          <Card>
            <BagsForm
              action={updateBags.bind(null, c.id)}
              remove={removeRestaurant}
              rows={links.data.map((l) => ({
                id: l.id,
                name: l.restaurants?.name ?? "",
                place: l.restaurants ? place(l.restaurants) : "",
                bags: l.bags,
              }))}
            />
          </Card>
        ) : (
          <EmptyState title="Nenhum restaurante nesta campanha">
            Marque abaixo os restaurantes que vão receber as sacolas. Depois, anote quantas foram para cada um.
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

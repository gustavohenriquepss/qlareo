import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { requireAccount } from "@/lib/account";
import { whatsappHref } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { CampaignReport, type ReportCampaign } from "./campaign-report";

export const metadata: Metadata = { title: "Painel · Qlareo" };

export default async function PainelPage() {
  const account = await requireAccount();
  const advertiser = account.advertisers[0];
  const firstName = account.fullName?.split(" ")[0];
  const campaigns = await advertiserCampaigns(account.advertisers.map((a) => a.id));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {firstName ? `Olá, ${firstName}` : "Seu painel"}
        </h1>
        {advertiser ? <p className="text-ink-secondary">{advertiser.name}</p> : null}
      </div>

      {account.isOperator ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface-2 px-5 py-4">
          <p className="text-sm text-ink-secondary">
            Você entrou como operador da Qlareo: cadastra restaurantes, cria campanhas e baixa os QR codes.
          </p>
          <Link href="/painel/operacao" className={buttonClasses({ size: "sm" })}>
            Ir para a operação
          </Link>
        </div>
      ) : null}

      {campaigns.map((c) => (
        <CampaignReport key={c.id} campaign={c} />
      ))}

      {/* Estado vazio: toda conta nova cai aqui até a Qlareo ligar uma campanha a ela.
          O operador não vê: o pedido de "fale com a Qlareo" é para o anunciante. */}
      {account.isOperator || campaigns.length ? null : (
        <section className="flex flex-col items-start gap-4 rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.08)] sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Nenhuma campanha ainda</h2>
          <p className="max-w-prose text-ink-secondary">
            Depois do pagamento, ligamos sua campanha a esta conta. A partir daí, aqui você envia a
            arte de cada lado da sacola e acompanha quantas pessoas leram seu QR code.
          </p>
          <ButtonLink
            href={whatsappHref(`Oi! Criei minha conta no painel da Qlareo (${account.email}) e quero anunciar.`)}
            target="_blank"
            rel="noopener noreferrer"
            size="md"
          >
            Falar com a Qlareo no WhatsApp
          </ButtonLink>
        </section>
      )}
    </>
  );
}

/**
 * Campanhas dos anunciantes da PRÓPRIA conta. O filtro por id é necessário: a
 * RLS deixa o operador ler todas, mas no painel dele só entram as dele.
 */
async function advertiserCampaigns(advertiserIds: string[]) {
  if (!advertiserIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, name, sides, status, destination_url, starts_on, ends_on, scans(count), " +
        "campaign_restaurants(id, bags, restaurants(name, city, neighborhood)), " +
        "artworks(id, side, file_name, content_type, size_bytes, status, review_note, reviewed_at, created_at)",
    )
    .in("advertiser_id", advertiserIds)
    .order("created_at", { ascending: false })
    .returns<ReportCampaign[]>();
  if (error) throw error;
  return data;
}

import { Card } from "@/components/ui/card";
import { isUuid } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";
import { createCampaign } from "../../actions";
import { EmptyState, PageHeading } from "../../ui";
import { advertiserOptions, operatorAdvertisers } from "../advertisers";
import { CampaignForm } from "../campaign-form";

export default async function NovaCampanhaPage({ searchParams }: PageProps<"/painel/operacao/campanhas/nova">) {
  const { anunciante } = await searchParams;
  const supabase = await createClient();
  const advertisers = advertiserOptions(await operatorAdvertisers(supabase));
  const preselected = isUuid(anunciante) && advertisers.some((a) => a.id === anunciante) ? anunciante : undefined;

  return (
    <>
      <PageHeading
        title="Nova campanha"
        lead="Depois de salvar, você liga os restaurantes e baixa os QR codes."
        back={{ href: "/painel/operacao/campanhas", label: "Campanhas" }}
      />
      {advertisers.length ? (
        <Card>
          <CampaignForm
            action={createCampaign}
            advertisers={advertisers}
            initial={{ advertiser_id: preselected }}
            submitLabel="Criar campanha"
          />
        </Card>
      ) : (
        <EmptyState title="Nenhum anunciante com conta">
          A campanha é sempre de um anunciante. Peça para ele criar a conta em app.qlareo.com/cadastro e
          volte aqui.
        </EmptyState>
      )}
    </>
  );
}

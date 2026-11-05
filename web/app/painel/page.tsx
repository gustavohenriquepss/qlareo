import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { requireAccount } from "@/lib/account";
import { whatsappHref } from "@/lib/site";

export const metadata: Metadata = { title: "Painel · Qlareo" };

export default async function PainelPage() {
  const account = await requireAccount();
  const advertiser = account.advertisers[0];
  const firstName = account.fullName?.split(" ")[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {firstName ? `Olá, ${firstName}` : "Seu painel"}
        </h1>
        {advertiser ? <p className="text-ink-secondary">{advertiser.name}</p> : null}
      </div>

      {account.isOperator ? (
        <p className="rounded-2xl bg-surface-2 px-5 py-4 text-sm text-ink-secondary">
          Você entrou como operador da Qlareo. A área de operação chega numa próxima etapa.
        </p>
      ) : null}

      {/* Estado vazio: toda conta nova cai aqui até a Qlareo ligar uma campanha a ela. */}
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
    </>
  );
}

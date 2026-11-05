import Link from "next/link";
import { cardClasses } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { operatorAdvertisers } from "../campanhas/advertisers";
import { EmptyState, PageHeading } from "../ui";

const day = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function AnunciantesPage() {
  const supabase = await createClient();
  const advertisers = await operatorAdvertisers(supabase);

  return (
    <>
      <PageHeading
        title="Anunciantes"
        lead="Cada conta criada em app.qlareo.com/cadastro vira um anunciante, com o nome da empresa que a pessoa digitou."
      />

      {advertisers.length ? (
        <ul className={`${cardClasses} divide-y divide-border-subtle`}>
          {advertisers.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{a.name}</p>
                <p className="truncate text-sm text-ink-muted">
                  {a.member_emails.join(", ") || "Sem conta ligada"} · desde {day.format(new Date(a.created_at))}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-ink-secondary">
                  {a.campaign_count === 0 ? "Nenhuma campanha" : a.campaign_count === 1 ? "1 campanha" : `${a.campaign_count} campanhas`}
                </span>
                <Link
                  href={`/painel/operacao/campanhas/nova?anunciante=${a.id}`}
                  className="font-semibold text-primary hover:text-primary-hover"
                  aria-label={`Nova campanha para ${a.name}`}
                >
                  Nova campanha
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum anunciante ainda">
          Quando alguém criar a conta no painel, aparece aqui.
        </EmptyState>
      )}
    </>
  );
}

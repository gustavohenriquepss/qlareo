import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Badge, cardClasses } from "@/components/ui/card";
import { periodLabel, SIDES_LABEL, STATUS_LABEL, statusTone, type Sides, type Status } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeading } from "../ui";

type Row = {
  id: string;
  name: string;
  sides: Sides;
  status: Status;
  starts_on: string | null;
  ends_on: string | null;
  advertisers: { name: string } | null;
  campaign_restaurants: { count: number }[];
};

export default async function CampanhasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, sides, status, starts_on, ends_on, advertisers(name), campaign_restaurants(count)")
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  if (error) throw error;

  return (
    <>
      <PageHeading
        title="Campanhas"
        action={
          <Link href="/painel/operacao/campanhas/nova" className={buttonClasses({ size: "md" })}>
            Nova campanha
          </Link>
        }
      />

      {data.length ? (
        <ul className={`${cardClasses} divide-y divide-border-subtle`}>
          {data.map((c) => {
            const qrs = c.campaign_restaurants[0]?.count ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/painel/operacao/campanhas/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-surface-2/60"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-ink-muted">
                      {c.advertisers?.name} · {SIDES_LABEL[c.sides]} · {periodLabel(c.starts_on, c.ends_on)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink-secondary">
                      {qrs === 0 ? "Sem restaurante" : qrs === 1 ? "1 restaurante" : `${qrs} restaurantes`}
                    </span>
                    <Badge tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="Nenhuma campanha ainda">
          Crie a campanha quando o anunciante pagar. Ela começa em “Aguardando arte”.
        </EmptyState>
      )}
    </>
  );
}

import Link from "next/link";
import { Card, cardClasses } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createRestaurant } from "../actions";
import { EmptyState, PageHeading } from "../ui";
import { RestaurantForm } from "./restaurant-form";

type Row = {
  id: string;
  name: string;
  city: string;
  neighborhood: string | null;
  campaign_restaurants: { count: number }[];
};

export default async function RestaurantesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, campaign_restaurants(count)")
    .order("city")
    .order("name")
    .returns<Row[]>();
  if (error) throw error;

  return (
    <>
      <PageHeading title="Restaurantes" lead="Os parceiros que recebem as sacolas." />

      {data.length ? (
        <ul className={`${cardClasses} divide-y divide-border-subtle`}>
          {data.map((r) => {
            const campaigns = r.campaign_restaurants[0]?.count ?? 0;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-sm text-ink-muted">{[r.neighborhood, r.city].filter(Boolean).join(", ")}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-ink-secondary">
                    {campaigns === 0 ? "Nenhuma campanha" : campaigns === 1 ? "1 campanha" : `${campaigns} campanhas`}
                  </span>
                  <Link
                    href={`/painel/operacao/restaurantes/${r.id}`}
                    className="font-semibold text-primary hover:text-primary-hover"
                    aria-label={`Editar ${r.name}`}
                  >
                    Editar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="Nenhum restaurante ainda">
          Cadastre o primeiro parceiro abaixo. Depois, ligue ele a uma campanha para gerar o QR code das
          sacolas.
        </EmptyState>
      )}

      <Card aria-labelledby="novo-restaurante">
        <h2 id="novo-restaurante" className="mb-4 text-lg font-semibold text-ink">
          Novo restaurante
        </h2>
        <RestaurantForm action={createRestaurant} submitLabel="Cadastrar restaurante" />
      </Card>
    </>
  );
}

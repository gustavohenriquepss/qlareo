import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { isUuid } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";
import { updateRestaurant } from "../../actions";
import { PageHeading } from "../../ui";
import { RestaurantForm } from "../restaurant-form";

export default async function EditarRestaurantePage({ params }: PageProps<"/painel/operacao/restaurantes/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("restaurants").select("name, city, neighborhood").eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <>
      <PageHeading title={data.name} back={{ href: "/painel/operacao/restaurantes", label: "Restaurantes" }} />
      <Card>
        <RestaurantForm action={updateRestaurant.bind(null, id)} initial={data} submitLabel="Salvar" />
      </Card>
    </>
  );
}

"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/account";
import { isUuid, parseCampaign, parseRestaurant } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";

/**
 * Escritas da área do operador. Todas usam a sessão de quem clicou: se uma
 * conta comum chegar aqui, a RLS recusa a escrita. O `requireOperator` só
 * adianta a resposta.
 */

export type ActionState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fields?: Record<string, string>;
      values?: Record<string, string>;
    }
  | { status: "saved"; message: string };

type ErrorState = Extract<ActionState, { status: "error" }>;

function dbError(error: PostgrestError, context: string): ErrorState {
  console.error(`[operacao] ${context}:`, error.code, error.message);
  if (error.code === "42501") return { status: "error", message: "Sua conta não tem permissão para isso." };
  if (error.code === "23514") return { status: "error", message: "O banco recusou algum dado. Confira os campos." };
  return { status: "error", message: "Não deu para salvar. Tente de novo." };
}

// ---------------------------------------------------------------------------
// Restaurantes
// ---------------------------------------------------------------------------

export async function createRestaurant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  const parsed = parseRestaurant(formData);
  if (!parsed.ok) return { status: "error", fields: parsed.fields, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("restaurants").insert(parsed.data);
  if (error) return { ...dbError(error, "criar restaurante"), values: parsedValues(formData) };

  refresh();
  return { status: "saved", message: `${parsed.data.name} entrou na rede.` };
}

export async function updateRestaurant(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  if (!isUuid(id)) return { status: "error", message: "Restaurante não encontrado." };
  const parsed = parseRestaurant(formData);
  if (!parsed.ok) return { status: "error", fields: parsed.fields, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("restaurants").update(parsed.data).eq("id", id);
  if (error) return { ...dbError(error, "editar restaurante"), values: parsedValues(formData) };

  redirect("/painel/operacao/restaurantes");
}

// ---------------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------------

export async function createCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  const parsed = parseCampaign(formData);
  if (!parsed.ok) return { status: "error", fields: parsed.fields, values: parsed.values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").insert(parsed.data).select("id").single();
  if (error) return { ...dbError(error, "criar campanha"), values: parsedValues(formData) };

  redirect(`/painel/operacao/campanhas/${data.id}`);
}

export async function updateCampaign(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  if (!isUuid(id)) return { status: "error", message: "Campanha não encontrada." };
  const parsed = parseCampaign(formData, { withStatus: true });
  if (!parsed.ok) return { status: "error", fields: parsed.fields, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(parsed.data).eq("id", id);
  if (error) return { ...dbError(error, "editar campanha"), values: parsedValues(formData) };

  refresh();
  return { status: "saved", message: "Campanha salva." };
}

/** Liga restaurantes à campanha. Cada ligação ganha o próprio QR (slug gerado no banco). */
export async function addRestaurants(campaignId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  const ids = formData.getAll("restaurant_id").filter(isUuid);
  if (!isUuid(campaignId)) return { status: "error", message: "Campanha não encontrada." };
  if (!ids.length) return { status: "error", message: "Marque pelo menos um restaurante." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_restaurants")
    .upsert(
      ids.map((restaurant_id) => ({ campaign_id: campaignId, restaurant_id })),
      { onConflict: "campaign_id,restaurant_id", ignoreDuplicates: true },
    );
  if (error) return dbError(error, "ligar restaurantes");

  refresh();
  return { status: "saved", message: ids.length === 1 ? "QR code criado." : `${ids.length} QR codes criados.` };
}

/**
 * Tira um restaurante da campanha. Só sai QR sem leitura: apagar a ligação
 * apaga as leituras junto (cascata), e um QR que já foi lido provavelmente já
 * está impresso numa sacola por aí.
 */
export async function removeRestaurant(qrId: string): Promise<void> {
  await requireOperator();
  if (!isUuid(qrId)) return;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("campaign_restaurant_id", qrId);
  if (error || count !== 0) return;

  const removed = await supabase.from("campaign_restaurants").delete().eq("id", qrId);
  if (removed.error) console.error("[operacao] remover QR:", removed.error.code, removed.error.message);
  refresh();
}

function parsedValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  return values;
}

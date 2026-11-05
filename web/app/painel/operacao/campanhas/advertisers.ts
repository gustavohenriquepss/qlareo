import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvertiserOption } from "./campaign-form";

export type OperatorAdvertiser = {
  id: string;
  name: string;
  created_at: string;
  member_emails: string[];
  campaign_count: number;
};

/** Anunciantes com o e-mail de quem tem acesso (`public.operator_advertisers`, só para operador). */
export async function operatorAdvertisers(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("operator_advertisers");
  if (error) throw error;
  return (data ?? []) as OperatorAdvertiser[];
}

export function advertiserOptions(rows: OperatorAdvertiser[]): AdvertiserOption[] {
  return rows
    .map((a) => ({ id: a.id, name: a.name, email: a.member_emails[0] ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

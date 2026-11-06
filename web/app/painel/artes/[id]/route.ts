import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";

/**
 * Abre (ou, com `?baixar`, baixa) uma versão de arte. Redireciona para uma URL
 * assinada do Storage que vale um minuto: o bucket é privado, e o link não
 * serve para ser repassado.
 *
 * Quem pode abrir é a RLS de `artworks` e do bucket: o anunciante só as das
 * próprias campanhas, o operador todas, e o resto recebe 404.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/painel/artes/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("artworks")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle<{ storage_path: string; file_name: string }>();
  if (!data) return new NextResponse(null, { status: 404 });

  const download = request.nextUrl.searchParams.has("baixar");
  const signed = await supabase.storage
    .from("artes")
    .createSignedUrl(data.storage_path, 60, download ? { download: data.file_name } : undefined);
  if (signed.error || !signed.data) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(signed.data.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

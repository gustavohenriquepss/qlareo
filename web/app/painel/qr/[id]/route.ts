import { NextResponse, type NextRequest } from "next/server";
import { fileSlug, isUuid } from "@/lib/campanhas";
import { qrPng, qrSvg, scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

/**
 * Arquivo do QR de um restaurante dentro da campanha, para mandar à gráfica.
 * `?formato=png` devolve PNG; o padrão é SVG.
 *
 * Quem pode baixar é decidido pela RLS de `campaign_restaurants`: o operador vê
 * todos, o anunciante só os da própria campanha, e o resto recebe 404.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/painel/qr/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_restaurants")
    .select("slug, campaigns(name), restaurants(name)")
    .eq("id", id)
    .maybeSingle<{ slug: string; campaigns: { name: string } | null; restaurants: { name: string } | null }>();
  if (!data) return new NextResponse(null, { status: 404 });

  const url = scanUrl(data.slug, request.nextUrl.origin);
  const name = fileSlug("qlareo", data.campaigns?.name ?? "", data.restaurants?.name ?? "", data.slug);
  const png = request.nextUrl.searchParams.get("formato") === "png";

  const headers = {
    "Content-Type": png ? "image/png" : "image/svg+xml",
    "Content-Disposition": `attachment; filename="${name}.${png ? "png" : "svg"}"`,
    "Cache-Control": "private, no-store",
  };
  const body = png ? new Uint8Array(await qrPng(url)) : await qrSvg(url);
  return new NextResponse(body, { headers });
}

import { NextResponse, type NextRequest } from "next/server";
import { fileSlug, isUuid } from "@/lib/campanhas";
import { qrPng, qrSvg, scanUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

/**
 * Arquivo do QR de uma campanha, para mandar à gráfica: o mesmo QR vai em
 * todas as sacolas dela. `?formato=png` devolve PNG; o padrão é SVG.
 *
 * Quem pode baixar é decidido pela RLS de `campaigns`: o operador vê todas, o
 * anunciante só as próprias, e o resto recebe 404.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/painel/qr/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("slug, name, advertisers(name)")
    .eq("id", id)
    .maybeSingle<{ slug: string; name: string; advertisers: { name: string } | null }>();
  if (!data) return new NextResponse(null, { status: 404 });

  const url = scanUrl(data.slug, request.nextUrl.origin);
  const name = fileSlug("qlareo", data.advertisers?.name ?? "", data.name, data.slug);
  const png = request.nextUrl.searchParams.get("formato") === "png";

  const headers = {
    "Content-Type": png ? "image/png" : "image/svg+xml",
    "Content-Disposition": `attachment; filename="${name}.${png ? "png" : "svg"}"`,
    "Cache-Control": "private, no-store",
  };
  const body = png ? new Uint8Array(await qrPng(url)) : await qrSvg(url);
  return new NextResponse(body, { headers });
}

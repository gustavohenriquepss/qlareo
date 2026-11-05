import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Fora: arquivos do Next, ícones e imagens. O redirect dos QR codes (/r/...)
  // também vai ficar fora quando existir: leitura de sacola não tem sessão e
  // não pode pagar uma ida ao Supabase Auth antes de redirecionar.
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon|favicon.ico|r/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};

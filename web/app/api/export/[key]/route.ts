/**
 * GET /api/export/:key?from&to&scope&grain → arquivo CSV.
 *
 * POR QUE UMA ROTA, e não gerar o CSV no browser a partir do que já está na
 * tela (os dados já viajam para o cliente por causa dos gráficos):
 *
 *  - o download vira um `<a href>` comum. Funciona antes da hidratação, aceita
 *    "abrir em nova aba", entra no gerenciador de downloads do navegador e é
 *    anunciado como link por leitor de tela. Um `Blob` + clique sintético não
 *    tem nada disso;
 *  - a URL é o próprio recurso: dá para mandar por e-mail, agendar num `curl`,
 *    versionar num script. É a mesma tese da query string em `lib/filters.ts`;
 *  - a tela mostra recortes (12 barras na ABC, tabela fechada por padrão). O
 *    arquivo tem que trazer o período inteiro, e quem sabe o total é o backend.
 *
 * A `QLAREO_API_KEY` continua sem chegar ao browser: esta rota roda no servidor
 * Next e chama o backend com o mesmo `lib/api.ts` das páginas.
 *
 * Os erros respondem TEXTO, não JSON. O consumidor aqui é um clique em link —
 * se algo falha, o navegador mostra o corpo, e uma frase em português ajuda
 * mais que `{"error":...}`.
 */
import { type NextRequest } from "next/server";

import { fetchReport } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { exportFilename, getExport } from "@/lib/exports";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { isItemsNotSynced } from "@/lib/types";

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params;
  const spec = getExport(key);
  if (!spec) {
    return text(404, `Exportação desconhecida: ${key}`);
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseFilters(params);

  const result = await fetchReport<unknown>(spec.report, toApiQuery(filters));
  if (!result.ok) {
    // 502: quem falhou foi o backend QLAREO, não esta rota.
    return text(
      502,
      result.hint ? `${result.error}\n\n${result.hint}` : result.error,
    );
  }

  // Relatórios de item sem sync não devem virar um CSV de zeros — um arquivo
  // de zeros é indistinguível de "não vendeu nada" depois de salvo em disco.
  if (isItemsNotSynced(result.data)) {
    return text(409, result.data.mensagem);
  }

  const csv = toCsv(spec.build(result.data));
  const filename = exportFilename(spec, filters);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Relatório de vendas não pode ser servido de cache: o mesmo par de
      // datas dá números diferentes conforme o sync avança.
      "Cache-Control": "no-store",
    },
  });
}

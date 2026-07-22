/**
 * Cliente do backend QLAREO — SÓ RODA NO SERVIDOR.
 *
 * A decisão que sustenta este arquivo: a `QLAREO_API_KEY` nunca chega ao
 * browser. Este módulo é importado apenas por Server Components; a chave sai do
 * ambiente do processo Next, vai no header `x-api-key` numa requisição
 * servidor→servidor, e o browser só recebe números já renderizados. Não
 * exponha nada daqui via `NEXT_PUBLIC_*` e não importe este módulo de um
 * componente com "use client".
 *
 * Erros viram valor de retorno (`ApiResult`), não exceção: uma falha do backend
 * é um estado normal da tela de relatório e merece uma mensagem honesta, não
 * uma página de erro genérica.
 */
import type { Grain, SalesScope } from "./types";

const DEFAULT_BASE_URL = "http://localhost:3000";

export interface ReportQuery {
  from: string; // ISO
  to: string; // ISO
  scope: SalesScope;
  grain?: Grain;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint?: string };

function baseUrl(): string {
  return (process.env.QLAREO_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Busca um relatório no backend. `report` é o segmento da rota
 * (`sales-by-period`, `new-vs-returning`, `top-products`, `promotions`).
 */
export async function fetchReport<T>(
  report: string,
  query: ReportQuery,
): Promise<ApiResult<T>> {
  const url = new URL(`${baseUrl()}/api/reports/${report}`);
  url.searchParams.set("from", query.from);
  url.searchParams.set("to", query.to);
  url.searchParams.set("scope", query.scope);
  if (query.grain) url.searchParams.set("grain", query.grain);

  const apiKey = process.env.QLAREO_API_KEY;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      // Relatório de vendas não deve servir número velho sem o usuário pedir.
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Não foi possível falar com o serviço QLAREO.",
      hint: `Verifique se o backend está de pé em ${baseUrl()} (\`npm start\` na raiz do projeto).`,
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: "Credencial de acesso inválida ou ausente.",
      hint: "Defina `QLAREO_API_KEY` no `.env.local` do web/ com o mesmo valor usado pelo backend.",
    };
  }

  if (!res.ok) {
    // O backend responde { error } nos 4xx/5xx; nunca vaza token no corpo.
    const body = await res.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `O serviço respondeu ${res.status}.`;
    return { ok: false, error: message };
  }

  return { ok: true, data: (await res.json()) as T };
}

/** GET /health — usado no cabeçalho para mostrar conta e estado do serviço. */
export async function fetchHealth(): Promise<
  ApiResult<{ status: string; account: string }>
> {
  try {
    const res = await fetch(`${baseUrl()}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Serviço respondeu ${res.status}.` };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "Serviço indisponível." };
  }
}

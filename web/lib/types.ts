/**
 * Espelho dos tipos de saída de `core/reports.ts` do backend.
 *
 * Duplicação consciente: o `web/` é um pacote npm separado (Next, com build),
 * enquanto a raiz roda TypeScript por type stripping sem build. Importar
 * `../../core` daqui acoplaria os dois sistemas de build. Como a fronteira é o
 * JSON da API, o contrato é este arquivo — mantenha-o em sincronia com
 * `core/reports.ts`.
 *
 * Todo valor monetário chega em unidade MAIOR (reais), já convertido pelo core.
 */

export type SalesScope = "bruto" | "liquido" | "todos";
export type Grain = "day" | "week" | "month";

/** GET /api/reports/sales-by-period */
export interface SalesRow {
  bucket: string; // 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM'
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
}

export interface SalesReport {
  linhas: SalesRow[];
  totalFaturamento: number;
  totalPedidos: number;
  ticketMedioGeral: number;
  porPagamento: Array<{ metodo: string; faturamento: number; pedidos: number }>;
  porSeller: Array<{ seller: string; faturamento: number; pedidos: number }>;
}

/** GET /api/reports/new-vs-returning */
export interface RetentionReport {
  novos: number;
  recorrentes: number;
  taxaRecompra: number;
  aviso: string;
}

export type AbcClass = "A" | "B" | "C";

/**
 * O que as linhas dos dois rankings de item têm em comum — a chave fica em cada
 * tipo concreto. Espelha `RankedRow` de `core/reports.ts`, e é o que o
 * `AbcChart` exige para desenhar qualquer um dos dois.
 */
export interface RankedRow {
  nome: string;
  receita: number;
  quantidade: number;
  pedidos: number;
  classe: AbcClass;
  percentualAcumulado: number;
}

/** GET /api/reports/top-products */
export interface ProductRow extends RankedRow {
  productId: string;
}

export interface ProductsReport {
  produtos: ProductRow[];
  totalPedidos: number;
}

/** GET /api/reports/top-skus */
export interface SkuRow extends RankedRow {
  skuId: string;
  /** A qual produto a variação pertence — a chave de junção com o ERP. */
  productId: string;
}

export interface SkusReport {
  skus: SkuRow[];
  totalPedidos: number;
}

/** GET /api/reports/promotions */
export interface PromoReport {
  pedidosComDesconto: number;
  receitaBrutaSemDesconto: number;
  receitaLiquida: number;
  descontoTotal: number;
  percentualDescontoMedio: number;
  observacao: string;
  pedidosAnalisados: number;
}

/**
 * Resposta alternativa dos relatórios de item quando o período tem pedidos mas
 * nenhum com detalhe sincronizado. O servidor devolve isto em vez de zeros —
 * a UI precisa distinguir "não há desconto" de "não sabemos ainda".
 */
export interface ItemsNotSyncedResponse {
  itensNaoSincronizados: true;
  totalPedidos: number;
  mensagem: string;
}

export function isItemsNotSynced(
  value: unknown,
): value is ItemsNotSyncedResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ItemsNotSyncedResponse).itensNaoSincronizados === true
  );
}

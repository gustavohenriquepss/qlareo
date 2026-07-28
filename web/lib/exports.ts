/**
 * Catálogo de exportações — o que cada CSV contém.
 *
 * Um registro único, em vez de montar colunas dentro de cada página, porque
 * exportação é CONTRATO: alguém vai construir uma planilha em cima destes
 * cabeçalhos e reimportar o arquivo todo mês. Com tudo num lugar dá para ver
 * de uma vez o que muda quando um relatório ganha campo — e não há como uma
 * página renomear "Faturamento" e as outras não.
 *
 * O CSV NÃO é a tabela da tela. Diferenças deliberadas:
 *  - a data sai em ISO (`2026-07-22`), não em `22/07`: ordena certo e não
 *    depende do rótulo curto que o gráfico precisava;
 *  - produto leva `productId`, que a tela esconde: numa planilha a chave de
 *    junção com o ERP vale mais que a economia de uma coluna;
 *  - não há linha de total. Total é `=SOMA()`, e uma linha de total no meio do
 *    dado quebra filtro, tabela dinâmica e reimportação.
 *
 * Nem preâmbulo com filtros: as duas primeiras linhas de metadados que muita
 * ferramenta escreve são o que faz o Excel errar as colunas. O período e o
 * recorte vão no NOME DO ARQUIVO (ver `exportFilename`), onde não atrapalham.
 */
import { count, money, percent, type Sheet } from "./csv";
import type { Filters } from "./filters";
import type {
  AttributionReport,
  CanceledReport,
  ProductsReport,
  RegionReport,
  PromoReport,
  RetentionReport,
  SalesReport,
  SkusReport,
} from "./types";

export interface ExportSpec {
  /** Segmento da rota do backend, o mesmo que a página usa em `fetchReport`. */
  report: string;
  /** Rótulo do botão/link na interface. */
  label: string;
  /** Trecho do nome do arquivo. */
  slug: string;
  build(data: unknown): Sheet;
}

/**
 * Confina o cast num lugar só. O corpo do backend chega como `unknown` (a rota
 * de exportação é genérica); cada `build` declara o tipo que espera e a
 * conversão acontece aqui, não espalhada em seis `as`.
 */
function spec<T>(s: {
  report: string;
  label: string;
  slug: string;
  build: (data: T) => Sheet;
}): ExportSpec {
  return { ...s, build: (data: unknown) => s.build(data as T) };
}

export const EXPORTS = {
  "vendas-por-periodo": spec<SalesReport>({
    report: "sales-by-period",
    label: "Faturamento por período",
    slug: "faturamento-por-periodo",
    build: (d) => ({
      columns: ["Período", "Faturamento (R$)", "Pedidos", "Ticket médio (R$)"],
      rows: d.linhas.map((r) => [
        r.bucket,
        money(r.faturamento),
        count(r.pedidos),
        money(r.ticketMedio),
      ]),
    }),
  }),

  "vendas-por-pagamento": spec<SalesReport>({
    report: "sales-by-period",
    label: "Por meio de pagamento",
    slug: "faturamento-por-pagamento",
    build: (d) => ({
      columns: ["Meio de pagamento", "Faturamento (R$)", "Pedidos"],
      rows: d.porPagamento.map((p) => [
        p.metodo,
        money(p.faturamento),
        count(p.pedidos),
      ]),
    }),
  }),

  "vendas-por-seller": spec<SalesReport>({
    report: "sales-by-period",
    label: "Por seller",
    slug: "faturamento-por-seller",
    build: (d) => ({
      columns: ["Seller", "Faturamento (R$)", "Pedidos"],
      rows: d.porSeller.map((s) => [
        s.seller,
        money(s.faturamento),
        count(s.pedidos),
      ]),
    }),
  }),

  clientes: spec<RetentionReport>({
    report: "new-vs-returning",
    label: "Novos vs. recorrentes",
    slug: "novos-vs-recorrentes",
    build: (d) => {
      const total = d.novos + d.recorrentes;
      const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);
      // Formato longo (uma linha por segmento) em vez de uma linha larga com
      // as duas contagens: assim a planilha vira gráfico direto e continua
      // funcionando se um dia aparecer um terceiro segmento.
      return {
        columns: ["Segmento", "Clientes", "% da base"],
        rows: [
          ["Novos", count(d.novos), percent(share(d.novos))],
          ["Recorrentes", count(d.recorrentes), percent(share(d.recorrentes))],
        ],
      };
    },
  }),

  produtos: spec<ProductsReport>({
    report: "top-products",
    label: "Produtos e curva ABC",
    slug: "produtos-abc",
    build: (d) => ({
      columns: [
        "Classe",
        "Produto",
        "ID do produto",
        "Receita (R$)",
        "Quantidade",
        "Pedidos",
        "% acumulado",
      ],
      rows: d.produtos.map((p) => [
        p.classe,
        p.nome,
        p.productId,
        money(p.receita),
        count(p.quantidade),
        count(p.pedidos),
        percent(p.percentualAcumulado),
      ]),
    }),
  }),

  skus: spec<SkusReport>({
    report: "top-skus",
    label: "SKUs e curva ABC",
    slug: "skus-abc",
    build: (d) => ({
      // As DUAS chaves, e nesta ordem: o `skuId` é a linha, o `productId` é o
      // que permite um PROCV agrupando as variações de volta em produto. Levar
      // só uma delas obrigaria quem monta a planilha a voltar aqui.
      columns: [
        "Classe",
        "SKU",
        "ID do SKU",
        "ID do produto",
        "Receita (R$)",
        "Quantidade",
        "Pedidos",
        "% acumulado",
      ],
      rows: d.skus.map((s) => [
        s.classe,
        s.nome,
        s.skuId,
        s.productId,
        money(s.receita),
        count(s.quantidade),
        count(s.pedidos),
        percent(s.percentualAcumulado),
      ]),
    }),
  }),

  promocoes: spec<PromoReport>({
    report: "promotions",
    label: "Efetividade de promoções",
    slug: "promocoes",
    build: (d) => ({
      // Relatório de escalares, não de linhas. Vira formato indicador/valor —
      // com a UNIDADE em coluna própria, já que a mesma coluna "Valor" mistura
      // reais, percentual e contagem.
      columns: ["Indicador", "Valor", "Unidade"],
      rows: [
        ["Receita bruta sem desconto", money(d.receitaBrutaSemDesconto), "R$"],
        ["Desconto concedido", money(d.descontoTotal), "R$"],
        ["Receita líquida", money(d.receitaLiquida), "R$"],
        ["Desconto médio", percent(d.percentualDescontoMedio), "%"],
        ["Pedidos com desconto", count(d.pedidosComDesconto), "pedidos"],
        ["Pedidos analisados", count(d.pedidosAnalisados), "pedidos"],
      ],
    }),
  }),
  regiao: spec<RegionReport>({
    report: "sales-by-region",
    label: "Vendas por região",
    slug: "vendas-por-uf",
    build: (d) => ({
      // Inclui a linha "Sem UF informada": sem ela a soma da planilha não
      // fecharia com o faturamento do período, e quem reconcilia acharia que
      // faltou dado.
      columns: [
        "UF",
        "Faturamento (R$)",
        "Pedidos",
        "Ticket médio (R$)",
        "% do período",
      ],
      rows: d.linhas.map((l) => [
        l.uf,
        money(l.faturamento),
        count(l.pedidos),
        money(l.ticketMedio),
        percent(l.participacao),
      ]),
    }),
  }),

  cupons: spec<AttributionReport>({
    report: "coupons-and-sources",
    label: "Por cupom",
    slug: "cupons",
    build: (d) => ({
      columns: ["Cupom", "Faturamento (R$)", "Pedidos", "% do período"],
      rows: d.porCupom.map((c) => [
        c.chave,
        money(c.faturamento),
        count(c.pedidos),
        percent(c.participacao),
      ]),
    }),
  }),

  origem: spec<AttributionReport>({
    report: "coupons-and-sources",
    label: "Por origem e campanha",
    slug: "origem-e-campanha",
    build: (d) => ({
      // Origem e campanha na MESMA planilha, com uma coluna que diz qual é
      // qual: são duas quebras do mesmo conjunto, e dois arquivos obrigariam
      // quem monta o relatório mensal a juntá-los à mão toda vez.
      columns: ["Dimensão", "Valor", "Faturamento (R$)", "Pedidos", "% do período"],
      rows: [
        ...d.porOrigem.map((o) => [
          "Origem",
          o.chave,
          money(o.faturamento),
          count(o.pedidos),
          percent(o.participacao),
        ]),
        ...d.porCampanha.map((c) => [
          "Campanha",
          c.chave,
          money(c.faturamento),
          count(c.pedidos),
          percent(c.participacao),
        ]),
      ],
    }),
  }),

  cancelados: spec<CanceledReport>({
    report: "canceled-orders",
    label: "Cancelamentos por período",
    slug: "cancelamentos-por-periodo",
    build: (d) => ({
      // A série temporal, não os escalares: é a forma longa que vira gráfico e
      // tabela dinâmica na planilha. A taxa e o total do período são derivados
      // (=SOMA / contagem), então não viram linha aqui.
      //
      // "Valor cancelado (R$)", nunca "Faturamento": este CSV vai acabar na
      // mesma pasta que o de vendas, e é o cabeçalho que impede a soma errada.
      columns: ["Período", "Pedidos cancelados", "Valor cancelado (R$)"],
      rows: d.linhas.map((l) => [
        l.bucket,
        count(l.pedidos),
        money(l.valor),
      ]),
    }),
  }),

  "cancelados-lista": spec<CanceledReport>({
    report: "canceled-orders",
    label: "Pedidos Cancelados",
    slug: "pedidos-cancelados",
    build: (d) => ({
      // A lista pedido a pedido — a granularidade que a série por período agrega
      // e que cruza com o ERP na hora de conferir cada cancelamento. Data em ISO
      // pela mesma razão do resto do arquivo: ordena certo na planilha.
      columns: ["Pedido", "Data", "Valor cancelado (R$)", "Pagamento"],
      rows: d.pedidos.map((p) => [
        p.pedido,
        p.data,
        money(p.valor),
        p.pagamento,
      ]),
    }),
  }),
} as const satisfies Record<string, ExportSpec>;

export type ExportKey = keyof typeof EXPORTS;

export function getExport(key: string): ExportSpec | undefined {
  return Object.hasOwn(EXPORTS, key)
    ? EXPORTS[key as ExportKey]
    : undefined;
}

/**
 * O que cada tela oferece para exportar. Fica aqui, e não em cada página, pelo
 * mesmo motivo do resto do arquivo: é a lista que precisa ficar completa.
 *
 * Uma exportação por tela desde que Vendas virou três sub-abas: o botão exporta
 * o que está à vista, sem o usuário ter de escolher entre três rótulos para
 * descobrir qual corresponde ao gráfico que ele está olhando. A lista continua
 * sendo de arrays porque a estrutura de uma tela com mais de um dataset ainda é
 * legítima — é o que uma tela consolidada voltaria a precisar.
 */
export const PAGE_EXPORTS = {
  "/vendas": ["vendas-por-periodo"],
  "/vendas/pagamento": ["vendas-por-pagamento"],
  "/vendas/seller": ["vendas-por-seller"],
  "/clientes": ["clientes"],
  "/produtos": ["produtos"],
  "/produtos/skus": ["skus"],
  "/vendas/regiao": ["regiao"],
  "/promocoes": ["promocoes"],
  "/promocoes/cupons": ["cupons"],
  "/promocoes/origem": ["origem"],
  "/cancelados": ["cancelados-lista", "cancelados"],
} as const satisfies Record<string, ReadonlyArray<ExportKey>>;

export type ExportPage = keyof typeof PAGE_EXPORTS;

/**
 * `qlareo-produtos-abc-2026-06-23-a-2026-07-22-liquido.csv`.
 *
 * Período e recorte no nome porque a mesma tela exporta arquivos diferentes a
 * cada filtro: sem isso, duas exportações viram `produtos.csv` e
 * `produtos (1).csv` na pasta de Downloads e ninguém sabe qual é qual um mês
 * depois. Tudo em ASCII e minúsculo — nome de arquivo atravessa Windows,
 * e-mail e Drive.
 */
export function exportFilename(spec: ExportSpec, filters: Filters): string {
  return `qlareo-${spec.slug}-${filters.from}-a-${filters.to}-${filters.scope}.csv`;
}

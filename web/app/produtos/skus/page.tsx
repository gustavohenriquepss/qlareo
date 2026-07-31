/**
 * Produtos vendidos, com os SKUs de cada um escondidos até o usuário abrir.
 *
 * Irmã de `/produtos`, com a curva ABC trocada por HIERARQUIA:
 *
 *   /produtos      → sortimento: quais produtos concentram a receita (classe A/B/C)
 *   /produtos/skus → o inventário do período: TODOS os produtos vendidos e,
 *                    dentro de cada um, TODAS as variações
 *
 * Sem ABC aqui, de propósito. A classificação responde "onde está minha
 * receita", e essa pergunta já tem tela. Esta responde outra: "o que saiu, e em
 * que tamanho". Classificar de novo — agora sobre a base de SKU — daria um
 * segundo conjunto de classes A/B/C que não bate com o da tela vizinha, e dois
 * números que não reconciliam custam a confiança do lojista nos dois. Sem corte
 * por classe e sem recorte de "top N": a lista é completa por definição.
 *
 * DOIS RELATÓRIOS, não um. As linhas de produto NÃO são derivadas somando os
 * SKUs, e não é por preguiça: `receita` e `quantidade` são aditivas, mas
 * `pedidos` não é — um pedido com o P e o M do mesmo produto conta uma vez no
 * produto e duas vezes entre os SKUs. Somar a coluna daria um número inflado.
 * O `nome` também não sai da soma: vem de `nomeDoProduto()` no core, que deriva
 * o rótulo do produto a partir dos nomes das variações. Então cada nível vem da
 * função do core que sabe calculá-lo, e o `Promise.all` paga as duas em paralelo.
 *
 * A página busca e a `ProductSkuTable` desenha. A divisão é a fronteira
 * server/client: abrir e fechar é estado, e a chave da API não pode chegar ao
 * browser — então o fetch fica aqui e só o JSON já pronto atravessa.
 *
 * Relatório de ITEM: depende de o sync ter trazido o detalhe dos pedidos. Se não
 * trouxe, o backend responde `itensNaoSincronizados` em vez de zeros — "0
 * produtos" seria uma afirmação falsa sobre a loja.
 */
import { Card } from "@/components/Card";
import { ExportBar } from "@/components/ExportBar";
import { ProductSkuTable } from "@/components/ProductSkuTable";
import { EmptyState, ErrorState, NotSyncedState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { fetchReport } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { formatInt, formatMoney } from "@/lib/format";
import {
  isItemsNotSynced,
  type ItemsNotSyncedResponse,
  type ProductsReport,
  type SkuRow,
  type SkusReport,
} from "@/lib/types";

export default async function ProdutosVendidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const query = toApiQuery(filters);

  const [produtosResult, skusResult] = await Promise.all([
    fetchReport<ProductsReport | ItemsNotSyncedResponse>("top-products", query),
    fetchReport<SkusReport | ItemsNotSyncedResponse>("top-skus", query),
  ]);

  if (!produtosResult.ok) {
    return (
      <ErrorState error={produtosResult.error} hint={produtosResult.hint} />
    );
  }
  if (!skusResult.ok) {
    return <ErrorState error={skusResult.error} hint={skusResult.hint} />;
  }

  // Os dois relatórios leem o mesmo período com o mesmo recorte, então ou os
  // dois têm detalhe sincronizado ou nenhum tem. Basta um responder isso.
  if (isItemsNotSynced(produtosResult.data)) {
    return (
      <NotSyncedState
        totalPedidos={produtosResult.data.totalPedidos}
        mensagem={produtosResult.data.mensagem}
      />
    );
  }
  if (isItemsNotSynced(skusResult.data)) {
    return (
      <NotSyncedState
        totalPedidos={skusResult.data.totalPedidos}
        mensagem={skusResult.data.mensagem}
      />
    );
  }

  const { produtos, totalPedidos } = produtosResult.data;
  const { skus } = skusResult.data;

  if (produtos.length === 0) {
    return <EmptyState title="Nenhum produto vendido neste período." />;
  }

  // Os SKUs já chegam ordenados por receita; agrupar preservando essa ordem
  // mantém cada bloco de variações ordenado dentro do produto. Objeto simples e
  // não `Map`: isto atravessa a fronteira para a `ProductSkuTable`.
  const skusPorProduto: Record<string, SkuRow[]> = {};
  for (const sku of skus) {
    (skusPorProduto[sku.productId] ??= []).push(sku);
  }

  const receitaTotal = produtos.reduce((soma, p) => soma + p.receita, 0);

  return (
    <div className="space-y-4">
      <ExportBar page="/produtos/skus" filters={filters} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Receita em produtos"
          value={formatMoney(receitaTotal)}
          context={`${formatInt(totalPedidos)} pedidos analisados`}
          contextInTooltip
          emphasis
        />
        <StatTile
          label="Produtos vendidos"
          value={formatInt(produtos.length)}
          context="Todos os produtos com ao menos uma venda no período — sem corte por classe ou por receita."
          contextInTooltip
        />
        <StatTile
          label="SKUs vendidos"
          value={formatInt(skus.length)}
          context="As variações desses produtos. Abra um produto com mais de uma para ver as dele."
          contextInTooltip
        />
      </dl>

      <Card
        title="Todos os produtos vendidos no período"
        hint="Ordenados por receita, do maior para o menor. Clique num produto com mais de uma variação para ver os SKUs dele — a linha do produto já soma todos, então não some as duas."
      >
        <ProductSkuTable produtos={produtos} skusPorProduto={skusPorProduto} />
      </Card>
    </div>
  );
}

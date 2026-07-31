"use client";

/**
 * Tabela de produtos vendidos com as variações COLAPSADAS: o SKU só aparece
 * quando o usuário abre o produto.
 *
 * Client Component porque abrir e fechar é estado, e estado não existe num
 * Server Component. O que atravessa a fronteira são só DADOS (`produtos`,
 * `skusPorProduto` como objeto simples) — nenhuma função vem da página, e é por
 * isso que as colunas são montadas aqui dentro em vez de virem por prop:
 * `render` é função, e função não serializa de server para client.
 *
 * TUDO FECHADO ao carregar. Uma loja com 400 produtos e 3 variações cada abre
 * 1.600 linhas de uma vez, e a lista de produtos — que é o assunto da tela —
 * fica impossível de percorrer. Fechado, a página mostra os produtos; o SKU é o
 * detalhe de quem foi atrás dele.
 *
 * Produto de VARIAÇÃO ÚNICA não abre: a linha do SKU repetiria a do produto
 * inteira (mesmo nome, mesma receita, mesma quantidade) e o único campo novo
 * seria o código do SKU, que continua no CSV. Deixar a seta ali para revelar uma
 * cópia treina o usuário a não confiar nas outras.
 *
 * ACESSIBILIDADE: o controle de verdade é o `<button>` dentro da célula do nome,
 * com `aria-expanded`. Ele é quem recebe foco, quem é anunciado como botão e
 * quem diz se está aberto. O clique na linha inteira (`onRowClick`) é atalho de
 * MOUSE em cima disso — uma `<tr>` com `onClick` não é focável nem anunciada, e
 * sozinha deixaria a tela inutilizável no teclado.
 */
import { useState } from "react";

import { DataTable, type Column } from "@/components/DataTable";
import { formatInt, formatMoney } from "@/lib/format";
import type { ProductRow, SkuRow } from "@/lib/types";

/**
 * A tabela é uma lista plana de linhas de DOIS níveis — não uma árvore. Um
 * `<table>` não aninha, e achatar aqui deixa a `DataTable` genérica: o nível é
 * um campo da linha, não uma estrutura que ela precise conhecer.
 */
type Linha =
  | {
      nivel: "produto";
      produto: ProductRow;
      variacoes: number;
      /** Tem mais de uma variação — só então a linha vira controle. */
      expansivel: boolean;
      aberto: boolean;
    }
  | { nivel: "sku"; sku: SkuRow; produto: string };

export function ProductSkuTable({
  produtos,
  skusPorProduto,
}: {
  produtos: ProductRow[];
  /** Objeto simples, não `Map`: precisa atravessar server → client. */
  skusPorProduto: Record<string, SkuRow[]>;
}) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());

  const alternar = (productId: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      // `delete` devolve false quando não estava lá — então o mesmo passo
      // fecha o que está aberto e abre o que está fechado.
      if (!proximo.delete(productId)) proximo.add(productId);
      return proximo;
    });

  const linhas: Linha[] = produtos.flatMap((produto) => {
    const variacoes = skusPorProduto[produto.productId] ?? [];
    // Variação ÚNICA não abre. A linha do SKU seria uma cópia da linha do
    // produto — mesmo nome, mesma receita, mesma quantidade —, e um controle
    // que só revela o que já está na tela ensina o usuário a desconfiar dos
    // outros. Abrir vale quando há o que comparar, e com uma variação não há.
    const expansivel = variacoes.length > 1;
    const aberto = expansivel && abertos.has(produto.productId);
    const linhaProduto: Linha = {
      nivel: "produto",
      produto,
      variacoes: variacoes.length,
      expansivel,
      aberto,
    };
    if (!aberto) return [linhaProduto];
    return [
      linhaProduto,
      ...variacoes.map(
        (sku): Linha => ({ nivel: "sku", sku, produto: produto.nome }),
      ),
    ];
  });

  const receitaTotal = produtos.reduce((soma, p) => soma + p.receita, 0);
  const unidades = produtos.reduce((soma, p) => soma + p.quantidade, 0);

  const columns: Array<Column<Linha>> = [
    {
      key: "nome",
      header: "Produto / SKU",
      render: (l) =>
        l.nivel === "produto" ? (
          // Produto de variação única não é controle: vira texto, sem botão,
          // sem seta e sem foco. Um `<button>` desabilitado no lugar seria
          // pior — continua na árvore de acessibilidade, anunciado como algo
          // que existe mas não funciona.
          l.expansivel ? (
            <button
              type="button"
              // A linha inteira também alterna (ver `onRowClick`); sem isto o
              // clique no botão subiria para a `<tr>` e o produto abriria e
              // fecharia no mesmo gesto.
              onClick={(e) => {
                e.stopPropagation();
                alternar(l.produto.productId);
              }}
              aria-expanded={l.aberto}
              // Nome explícito, e não o "name from content" do botão: o texto
              // visível está dentro de `<span>`s aninhados e o Chrome expõe o
              // botão SEM nome acessível — um leitor de tela anunciaria só
              // "botão, recolhido", dez vezes seguidas. Repete o rótulo visível
              // (WCAG 2.5.3) e para por aí: quem diz se está aberto é o
              // `aria-expanded`, não o texto.
              aria-label={`${l.produto.nome}, ${l.variacoes} SKUs`}
              className="flex items-center gap-2 text-left"
            >
              <Chevron aberto={l.aberto} />
              <span className="font-medium text-ink">{l.produto.nome}</span>
              <span className="text-xs font-normal text-ink-muted">
                {l.variacoes} SKUs
              </span>
            </button>
          ) : (
            // O espaço da seta fica reservado mesmo sem seta: sem isso o nome
            // destes produtos escorregaria para a esquerda dos demais, e o olho
            // leria o desalinhamento como outro nível de hierarquia.
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="w-3 shrink-0" />
              <span className="font-medium text-ink">{l.produto.nome}</span>
            </span>
          )
        ) : (
          // O recuo é o único sinal visual do nível, e não atravessa um leitor
          // de tela — daí o rótulo `sr-only` dizendo de qual produto esta
          // variação é. `pl-10` (40px) é o dobro do recuo do nome do produto
          // (seta de 12px + `gap-2`), então a variação cai numa segunda coluna
          // óptica em vez de parecer um produto mal alinhado.
          <span className="block pl-10">
            <span className="sr-only">SKU de {l.produto}: </span>
            <span className="text-ink-secondary">{l.sku.nome}</span>
          </span>
        ),
    },
    {
      key: "codigo",
      header: "Código",
      // O código fica VISÍVEL aqui (em `/produtos` ele só vai no CSV): quem abre
      // esta tela está com o estoque na frente, e o código é como o item é
      // chamado no ERP e no coletor.
      render: (l) => (
        <span className="tnum text-ink-muted">
          {l.nivel === "produto" ? l.produto.productId : l.sku.skuId}
        </span>
      ),
    },
    {
      key: "receita",
      header: "Receita",
      numeric: true,
      render: (l) =>
        l.nivel === "produto" ? (
          <span className="font-medium text-ink">
            {formatMoney(l.produto.receita)}
          </span>
        ) : (
          formatMoney(l.sku.receita)
        ),
    },
    {
      key: "quantidade",
      header: "Qtd.",
      numeric: true,
      render: (l) =>
        formatInt(
          l.nivel === "produto" ? l.produto.quantidade : l.sku.quantidade,
        ),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      // NÃO some esta coluna dos SKUs para chegar no produto: um pedido que
      // levou duas variações do mesmo item conta uma vez na linha do produto e
      // duas entre as variações. Os dois números estão certos, em níveis
      // diferentes — ver o cabeçalho de `app/produtos/skus/page.tsx`.
      render: (l) =>
        formatInt(l.nivel === "produto" ? l.produto.pedidos : l.sku.pedidos),
    },
  ];

  return (
    <DataTable
      caption="Produtos vendidos por receita. Produto com mais de uma variação abre os SKUs dele, indentados abaixo."
      columns={columns}
      rows={linhas}
      rowKey={(l) =>
        l.nivel === "produto"
          ? `produto:${l.produto.productId}`
          : `sku:${l.sku.skuId}`
      }
      // Sem faixa de cor por nível: a hierarquia já está no recuo e no peso do
      // texto, e pintar a linha do produto acrescentaria uma terceira codificação
      // para a mesma informação. O que a classe carrega é só a AFORDÂNCIA —
      // cursor de mão em quem abre. O realce de hover é da própria `DataTable`
      // e vale para toda linha, porque ele diz "esta é a linha que você está
      // apontando", que é verdade nos dois níveis.
      rowClassName={(l) =>
        l.nivel === "produto" && l.expansivel ? "cursor-pointer" : ""
      }
      onRowClick={(l) => {
        if (l.nivel === "produto" && l.expansivel) {
          alternar(l.produto.productId);
        }
      }}
      footer={
        // Total do nível PRODUTO, e por isso não muda quando o usuário abre ou
        // fecha uma linha: o rodapé responde "quanto vendeu no período", não
        // "quanto está visível agora". Somar as linhas de SKU daria o mesmo em
        // receita e quantidade (são aditivas), mas o total tem de vir do mesmo
        // nível que a coluna de pedidos, que não é.
        <tr>
          <td className="px-3 py-2 text-left" colSpan={2}>
            Total
          </td>
          <td className="tnum px-3 py-2 text-right">
            {formatMoney(receitaTotal)}
          </td>
          <td className="tnum px-3 py-2 text-right">{formatInt(unidades)}</td>
          <td className="px-3 py-2" />
        </tr>
      }
    />
  );
}

/**
 * Só decoração, e por isso `aria-hidden`: o estado real está em `aria-expanded`
 * no botão e nas linhas que aparecem abaixo. Anunciar "seta" a mais não diz nada
 * a quem já ouviu "recolhido".
 */
function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      className={`shrink-0 text-ink-muted transition-transform ${
        aberto ? "rotate-90" : ""
      }`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

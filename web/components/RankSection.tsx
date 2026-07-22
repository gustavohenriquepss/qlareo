/**
 * Ranking por faturamento: gráfico de barras + a mesma informação em tabela,
 * atrás de um disclosure.
 *
 * Existe para as sub-abas "Meio de pagamento" e "Seller", que são o MESMO
 * relatório com outra chave de agrupamento. O que muda entre elas é o rótulo da
 * primeira coluna e a frase de vazio — tudo o mais é idêntico, e duas cópias do
 * gráfico + tabela divergiriam na primeira alteração.
 *
 * O rodapé se chama "Soma da lista", não "Total", e há uma nota quando essa
 * soma não bate com o faturamento do período: pedido sem meio de pagamento
 * informado não entra em nenhuma linha, e um rodapé rotulado "Total" logo
 * abaixo de um KPI com outro número faria o usuário desconfiar dos dois. A
 * diferença é do dado, então é melhor mostrá-la do que escondê-la.
 */
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { RankBarChart, type RankRow } from "@/components/charts/RankBarChart";
import { formatInt, formatMoney, formatPercent } from "@/lib/format";

export function RankSection({
  title,
  hint,
  columnHeader,
  rows,
  totalPeriodo,
  gapNote,
  emptyMessage,
}: {
  title: string;
  hint: string;
  /** Rótulo da coluna de chave: "Meio de pagamento", "Seller". */
  columnHeader: string;
  rows: RankRow[];
  /** Faturamento do período inteiro, para revelar o que ficou de fora. */
  totalPeriodo: number;
  /** Explica POR QUE sobrou faturamento fora da lista. */
  gapNote: string;
  emptyMessage: string;
}) {
  const columns: Array<Column<RankRow>> = [
    { key: "rotulo", header: columnHeader, render: (r) => r.rotulo },
    {
      key: "faturamento",
      header: "Faturamento",
      numeric: true,
      render: (r) => formatMoney(r.faturamento),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      numeric: true,
      render: (r) => formatInt(r.pedidos),
    },
  ];

  const somaLista = rows.reduce((sum, r) => sum + r.faturamento, 0);
  const foraDaLista = totalPeriodo - somaLista;
  // Meio centavo de tolerância: a diferença aqui é soma de float, e arredondar
  // para exibição já esconde qualquer coisa menor que isso.
  const temLacuna = Math.abs(foraDaLista) > 0.005;

  if (rows.length === 0) {
    return (
      <Card title={title} hint={hint}>
        {/* Frase específica em vez de "sem dados": o motivo de a lista estar
            vazia é diferente em cada recorte, e é ele que diz o que fazer. */}
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      </Card>
    );
  }

  return (
    // Dois blocos, como na tela de produtos: gráfico e tabela respondem
    // perguntas diferentes ("qual é a forma" e "quanto exatamente"), e cada um
    // com seu título deixa o olho pular direto para a que interessa em vez de
    // varrer um cartão comprido. Sem lista vazia não há o que separar, por isso
    // o retorno acima é um cartão só.
    <div className="space-y-4">
      <Card title={title} hint={hint}>
        <RankBarChart rows={rows} />
      </Card>

      <Card
        title={`Valores por ${columnHeader.toLowerCase()}`}
        hint="Os mesmos números do gráfico, com o valor exato."
      >
        <DataTable
          caption={`Faturamento por ${columnHeader.toLowerCase()}`}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.rotulo}
          footer={
            <tr>
              <td className="px-3 py-2 text-left">Soma da lista</td>
              <td className="tnum px-3 py-2 text-right">
                {formatMoney(somaLista)}
              </td>
              <td className="tnum px-3 py-2 text-right">
                {formatInt(rows.reduce((s, r) => s + r.pedidos, 0))}
              </td>
            </tr>
          }
        />

        {temLacuna && (
          // A nota vive no bloco da TABELA, não no do gráfico: ela explica o
          // rodapé "Soma da lista", e uma ressalva longe do número que ela
          // ressalva não é lida.
          <p className="mt-6 border-t border-border-subtle pt-3 text-xs leading-relaxed text-ink-muted">
            {formatMoney(foraDaLista)} (
            {formatPercent(
              totalPeriodo > 0 ? (foraDaLista / totalPeriodo) * 100 : 0,
            )}
            ) do faturamento do período não aparece nesta lista. {gapNote}
          </p>
        )}
      </Card>
    </div>
  );
}

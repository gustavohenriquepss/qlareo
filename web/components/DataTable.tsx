import type { ReactNode } from "react";

/**
 * Tabela de relatório.
 *
 * Existe por dois motivos, não um: é a forma certa de ler valores exatos, e é o
 * fallback de acessibilidade de todo gráfico desta aplicação — quem não
 * distingue as cores, ou lê por leitor de tela, tem os mesmos números aqui.
 *
 * Números alinhados à DIREITA e em `tnum` (dígitos de largura fixa): é o que
 * deixa as casas decimais na mesma coluna e torna a comparação visual entre
 * linhas possível.
 */
export interface Column<T> {
  key: string;
  header: string;
  /** Numérico → alinhado à direita, tabular. Default: texto à esquerda. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
  /** Rótulo textual para leitor de tela quando `render` devolve só cor/ícone. */
  className?: string;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  /** Linha de totais, opcional, fixada no rodapé da tabela. */
  footer?: ReactNode;
  /**
   * Classes extras por linha, para o que depende da linha INTEIRA e não cabe
   * numa célula — hoje o cursor de mão nas linhas que abrem algo. Só estilo: o
   * que a linha significa continua tendo de estar no texto, senão não chega a
   * quem lê por leitor de tela.
   */
  rowClassName?: (row: T) => string;
  /**
   * Clique na linha inteira. SÓ pode ser passado de um Client Component —
   * função não atravessa a fronteira server→client, e um Server Component que
   * passar isto quebra na serialização.
   *
   * É um atalho de MOUSE, nunca o único caminho: uma `<tr>` com `onClick` não
   * recebe foco nem é anunciada como controle. Quem usa isto precisa ter um
   * `<button>` de verdade dentro da linha (com `aria-expanded`, quando o clique
   * abre algo) — é ele que serve teclado e leitor de tela. Ver `ProductSkuTable`.
   */
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  footer,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-2 text-xs font-medium text-ink-muted ${
                  col.numeric ? "text-right" : "text-left"
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border-subtle last:border-b-0 hover:bg-surface-2 ${
                rowClassName?.(row) ?? ""
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-ink-secondary ${
                    col.numeric ? "tnum text-right" : "text-left"
                  } ${col.className ?? ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-border-strong font-medium text-ink">
            {footer}
          </tfoot>
        )}
      </table>
    </div>
  );
}

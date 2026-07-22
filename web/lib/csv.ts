/**
 * Serialização CSV — sem conhecimento de domínio. Quem decide colunas é
 * `lib/exports.ts`; aqui só se decide como um valor vira texto.
 *
 * Quatro decisões que parecem detalhe e não são, porque o destino real deste
 * arquivo é o Excel de um lojista brasileiro:
 *
 * 1. SEPARADOR `;`, não vírgula. Em pt-BR a vírgula é separador DECIMAL. Um CSV
 *    com `1234,50` separado por vírgula tem o dobro das colunas em metade das
 *    linhas. O Excel em português espera `;` — é o que abre com dois cliques.
 *
 * 2. BOM UTF-8 no início. Sem ele o Excel no Windows assume a codificação ANSI
 *    do sistema e "Promoções" vira "PromoÃ§Ãµes". É o bug de CSV mais comum no
 *    Brasil e custa 1 caractere para não existir.
 *
 * 3. NÚMERO SEM UNIDADE, com vírgula decimal e sem separador de milhar. "R$
 *    1.234,50" é texto: não soma, não faz média, não vira gráfico. A unidade
 *    vive no CABEÇALHO da coluna ("Faturamento (R$)") e a célula guarda
 *    `1234,50`, que o Excel pt-BR lê como número.
 *
 * 4. NEUTRALIZAÇÃO DE FÓRMULA. Nome de produto e nome de seller vêm da VTEX,
 *    ou seja, de fora. Uma célula que começa com `=`, `+`, `-`, `@`, TAB ou CR
 *    é interpretada como fórmula pelo Excel e pelo Google Sheets ao abrir o
 *    arquivo — um produto batizado de `=HYPERLINK(...)` executa na máquina de
 *    quem exportou. Isso é CSV injection, e a exportação é justamente o ponto
 *    onde dado não confiável atravessa para um interpretador. Ver `csvText`.
 */

/** Célula numérica já formatada por este módulo — não passa pela sanitização. */
interface NumericCell {
  readonly csvNumber: string;
}

export type Cell = string | number | NumericCell | null | undefined;

const SEP = ";";
/** CRLF por RFC 4180; é também o que o Excel emite. */
const EOL = "\r\n";
const BOM = String.fromCharCode(0xfeff);

function decimals(digits: number): Intl.NumberFormat {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // Sem separador de milhar: `1234,50` é lido como número por qualquer
    // ferramenta em pt-BR, enquanto `1.234,50` já custou horas a muita gente
    // ao ser importado fora do Excel.
    useGrouping: false,
  });
}

const MONEY = decimals(2);
const COUNT = decimals(0);
const PERCENT = decimals(1);

/** Valor monetário em reais. A unidade vai no cabeçalho, não na célula. */
export function money(value: number): Cell {
  return { csvNumber: MONEY.format(value) };
}

/** Contagem inteira (pedidos, quantidade, clientes). */
export function count(value: number): Cell {
  return { csvNumber: COUNT.format(value) };
}

/** Pontos percentuais, como o core devolve (42.5 = 42,5%). Sem o "%". */
export function percent(value: number): Cell {
  return { csvNumber: PERCENT.format(value) };
}

function isNumericCell(value: Cell): value is NumericCell {
  return typeof value === "object" && value !== null && "csvNumber" in value;
}

/**
 * Caracteres que fazem o Excel/Sheets tratar a célula como fórmula. `-` está na
 * lista porque `-1+1` é uma expressão válida; por isso números NUNCA passam por
 * aqui (viriam de `money`/`count`/`percent`, que este módulo gerou).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvText(value: string): string {
  // Prefixo `'`: o Excel entende como "o que vem a seguir é texto" e a fórmula
  // não roda. O apóstrofo fica visível em editores de texto simples — é o
  // preço, consciente, de não executar código de terceiro na planilha de quem
  // exportou.
  const safe = FORMULA_START.test(value) ? `'${value}` : value;

  // RFC 4180: aspas duplicadas dentro do campo, e o campo inteiro entre aspas
  // quando contém separador, aspas, quebra de linha ou espaço nas pontas.
  if (/[";\r\n]/.test(safe) || safe.trim() !== safe) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (isNumericCell(value)) return value.csvNumber;
  if (typeof value === "number") return decimals(2).format(value);
  return csvText(value);
}

export interface Sheet {
  columns: string[];
  rows: Cell[][];
}

/** Planilha → texto CSV pronto para virar corpo de resposta. */
export function toCsv(sheet: Sheet): string {
  const lines = [
    sheet.columns.map(csvText).join(SEP),
    ...sheet.rows.map((row) => row.map(csvCell).join(SEP)),
  ];
  // A linha final também termina em CRLF: um arquivo sem quebra no fim faz
  // algumas ferramentas engolirem a última linha.
  return BOM + lines.join(EOL) + EOL;
}

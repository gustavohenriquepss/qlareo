"use client";

/**
 * Faturamento ao longo do tempo — linha, porque o eixo é contínuo e a pergunta
 * é "subiu ou caiu".
 *
 * Uma série só: SEM legenda (o título do card já diz o que a linha é) e sem
 * rótulo em cada ponto (o tooltip dá o valor exato). Com poucos pontos a linha
 * não se sustenta, então o componente troca para barras — 3 pontos ligados por
 * uma reta sugerem uma tendência que não existe.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Grain, SalesRow } from "@/lib/types";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import {
  formatBucketLong,
  formatBucket,
  formatInt,
  formatMoney,
  formatMoneyCompact,
} from "@/lib/format";
import { TooltipRow, TooltipShell } from "./ChartTooltip";

const SERIES_1 = "var(--series-1)";
const AXIS = "var(--axis)";
const GRID = "var(--grid)";

/**
 * O mínimo que uma linha da série precisa ter. `SalesRow` satisfaz; `CanceledRow`
 * também — o campo do valor é indicado por `campoValor`, porque os dois se
 * chamam diferente de propósito (`faturamento` é dinheiro que entrou, `valor`
 * de cancelado não é, e o nome tem de dizer qual é qual).
 */
export interface TrendRow {
  bucket: string;
  pedidos: number;
}

interface Props<T extends TrendRow> {
  rows: T[];
  grain: Grain;
  /**
   * NOME do campo numérico a plotar — não uma função. Client Component: só
   * dado atravessa a fronteira server→client. Default `faturamento` mantém as
   * telas de vendas chamando isto sem mudar nada.
   */
  campoValor?: Extract<keyof T, string>;
  /** Rótulo do valor no tooltip. */
  rotuloValor?: string;
}

export function SalesTrendChart<T extends TrendRow>({
  rows,
  grain,
  campoValor = "faturamento" as Extract<keyof T, string>,
  rotuloValor = "Faturamento",
}: Props<T>) {
  const data = rows.map((r) => ({ ...r, rotulo: formatBucket(r.bucket, grain) }));
  const asBars = data.length < 4;
  // A animação de entrada do recharts é JS, então o bloco de reduced-motion do
  // globals.css não a alcança — é preciso desligá-la explicitamente.
  const animate = !usePrefersReducedMotion();

  const axes = (
    <>
      <CartesianGrid
        stroke={GRID}
        strokeDasharray="3 3"
        vertical={false}
      />
      <XAxis
        dataKey="rotulo"
        tick={{ fill: AXIS, fontSize: 11 }}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        minTickGap={16}
      />
      <YAxis
        tick={{ fill: AXIS, fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={64}
        tickFormatter={(v: number) => formatMoneyCompact(v)}
      />
      <Tooltip
        cursor={{ stroke: AXIS, strokeWidth: 1 }}
        content={(props) => {
          const row = props.payload?.[0]?.payload as T | undefined;
          if (!props.active || !row) return null;
          // Ticket médio só existe no relatório de vendas; a série de
          // cancelados não tem — e uma linha "R$ 0,00" ali seria uma
          // afirmação, não uma ausência.
          const ticket = (row as Partial<SalesRow>).ticketMedio;
          return (
            <TooltipShell title={formatBucketLong(row.bucket, grain)}>
              <TooltipRow
                color={SERIES_1}
                label={rotuloValor}
                value={formatMoney(Number(row[campoValor]))}
              />
              <TooltipRow label="Pedidos" value={formatInt(row.pedidos)} />
              {ticket !== undefined && (
                <TooltipRow label="Ticket médio" value={formatMoney(ticket)} />
              )}
            </TooltipShell>
          );
        }}
      />
    </>
  );

  return (
    // `aria-hidden`: o SVG do recharts não é navegável por teclado; leitor de
    // tela pegaria os rótulos de eixo soltos. A série completa está na tabela
    // que acompanha o gráfico em toda tela que o usa.
    <div className="h-72 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {asBars ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            <Bar
              dataKey={campoValor}
              fill={SERIES_1}
              radius={[4, 4, 0, 0]}
              maxBarSize={72}
              isAnimationActive={animate}
            />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            <Line
              // `linear`, não `monotone`: a curva suavizada inventa valores
              // entre dois dias — o faturamento do dia 5 não "passou por" um
              // pico às 12h do dia 4. Cada bucket é discreto; ligue-os com reta.
              type="linear"
              dataKey={campoValor}
              stroke={SERIES_1}
              strokeWidth={2}
              dot={false}
              isAnimationActive={animate}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

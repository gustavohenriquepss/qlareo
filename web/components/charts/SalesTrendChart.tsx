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

interface Props {
  rows: SalesRow[];
  grain: Grain;
}

export function SalesTrendChart({ rows, grain }: Props) {
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
          const row = props.payload?.[0]?.payload as SalesRow | undefined;
          if (!props.active || !row) return null;
          return (
            <TooltipShell title={formatBucketLong(row.bucket, grain)}>
              <TooltipRow
                color={SERIES_1}
                label="Faturamento"
                value={formatMoney(row.faturamento)}
              />
              <TooltipRow label="Pedidos" value={formatInt(row.pedidos)} />
              <TooltipRow
                label="Ticket médio"
                value={formatMoney(row.ticketMedio)}
              />
            </TooltipShell>
          );
        }}
      />
    </>
  );

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {asBars ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            <Bar
              dataKey="faturamento"
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
              dataKey="faturamento"
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

"use client";

/**
 * Ranking por categoria (meio de pagamento, seller) — barras HORIZONTAIS.
 *
 * Horizontal porque os rótulos são texto de comprimento livre ("Cartão de
 * crédito - Visa"): na vertical eles giram 45° e viram ilegíveis. Ordenado
 * decrescente, que é a leitura que interessa, e com o VALOR escrito na ponta de
 * cada barra — num relatório de faturamento, obrigar a estimar pelo
 * comprimento da barra é perder a precisão que o usuário veio buscar.
 *
 * Uma série só, então sem legenda: as categorias estão no eixo.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInt, formatMoney, formatMoneyCompact } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { TooltipRow, TooltipShell } from "./ChartTooltip";

const SERIES_1 = "var(--series-1)";
const AXIS = "var(--axis)";
const GRID = "var(--grid)";

export interface RankRow {
  rotulo: string;
  faturamento: number;
  pedidos: number;
}

export function RankBarChart({ rows }: { rows: RankRow[] }) {
  // Altura proporcional ao número de barras: um gráfico de 2 categorias não
  // deve esticar barras até virarem blocos, nem 12 categorias se espremerem.
  const height = Math.max(140, rows.length * 40 + 24);
  // Animação do recharts é JS: o bloco reduced-motion do CSS não a alcança.
  const animate = !usePrefersReducedMotion();

  return (
    // `aria-hidden`: o SVG do recharts não é navegável por teclado e leitor de
    // tela varreria seus nós de texto (ticks, rótulos de valor) fora de ordem.
    // A mesma informação, exata, está na tabela que acompanha todo gráfico do
    // app — é ela o caminho acessível, não o desenho.
    <div className="w-full" style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatMoneyCompact(v)}
          />
          <YAxis
            type="category"
            dataKey="rotulo"
            tick={{ fill: AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            width={130}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(props) => {
              const row = props.payload?.[0]?.payload as RankRow | undefined;
              if (!props.active || !row) return null;
              return (
                <TooltipShell title={row.rotulo}>
                  <TooltipRow
                    color={SERIES_1}
                    label="Faturamento"
                    value={formatMoney(row.faturamento)}
                  />
                  <TooltipRow label="Pedidos" value={formatInt(row.pedidos)} />
                </TooltipShell>
              );
            }}
          />
          <Bar
            dataKey="faturamento"
            fill={SERIES_1}
            radius={[0, 4, 4, 0]}
            maxBarSize={28}
            isAnimationActive={animate}
          >
            <LabelList
              dataKey="faturamento"
              position="right"
              className="tnum"
              fill="var(--ink-secondary)"
              fontSize={11}
              // O tipo do LabelList é mais frouxo que o do eixo (o valor pode
              // vir undefined numa barra sem dado), então normalize aqui.
              formatter={(v: unknown) =>
                typeof v === "number" ? formatMoneyCompact(v) : ""
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

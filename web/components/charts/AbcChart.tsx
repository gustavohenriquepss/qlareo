"use client";

/**
 * Curva ABC — receita por produto, barra colorida pela classe.
 *
 * DECISÃO: isto NÃO é o gráfico de Pareto clássico. O Pareto põe a receita em
 * barras num eixo e o percentual acumulado numa linha em SEGUNDO eixo Y — e
 * dois eixos Y na mesma área de plotagem é a fonte nº 1 de leitura errada de
 * gráfico: as duas escalas são arbitrárias, então "a linha cruza as barras
 * aqui" não significa nada. Um eixo só. O percentual acumulado, que é o número
 * que define a classe, aparece na TABELA abaixo, onde é lido com precisão.
 *
 * A cor codifica MAGNITUDE (A > B > C), então é uma rampa de UMA matiz,
 * clara→escura, não três cores diferentes. E a classe nunca é só cor: está
 * escrita na legenda, no tooltip e na coluna "Classe" da tabela.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProductRow } from "@/lib/types";
import {
  formatInt,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { TooltipRow, TooltipShell } from "./ChartTooltip";

const AXIS = "var(--axis)";
const GRID = "var(--grid)";

export const CLASS_COLOR: Record<ProductRow["classe"], string> = {
  A: "var(--abc-a)",
  B: "var(--abc-b)",
  C: "var(--abc-c)",
};

const CLASS_HELP: Record<ProductRow["classe"], string> = {
  A: "até 80% da receita",
  B: "80–95%",
  C: "os últimos 5%",
};

/** Acima disso, barras viram tiras ilegíveis — a tabela é o lugar certo. */
const MAX_BARS = 12;

export function AbcChart({ produtos }: { produtos: ProductRow[] }) {
  const data = produtos.slice(0, MAX_BARS).map((p) => ({
    ...p,
    // Nome de produto é longo; corta no eixo e mostra inteiro no tooltip.
    rotulo: p.nome.length > 22 ? `${p.nome.slice(0, 21)}…` : p.nome,
  }));

  const classesPresentes = (["A", "B", "C"] as const).filter((c) =>
    data.some((p) => p.classe === c),
  );

  // Animação do recharts é JS: o bloco reduced-motion do CSS não a alcança.
  const animate = !usePrefersReducedMotion();

  return (
    <div>
      {/* Legenda sempre presente: são 3 identidades, e cor sozinha não basta. */}
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {classesPresentes.map((c) => (
          <li key={c} className="flex items-center gap-2 text-xs text-ink-secondary">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: CLASS_COLOR[c] }}
            />
            <span className="font-medium text-ink">Classe {c}</span>
            <span className="text-ink-muted">{CLASS_HELP[c]}</span>
          </li>
        ))}
      </ul>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={6}
          >
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(props) => {
                const row = props.payload?.[0]?.payload as ProductRow | undefined;
                if (!props.active || !row) return null;
                return (
                  <TooltipShell title={row.nome}>
                    <TooltipRow
                      color={CLASS_COLOR[row.classe]}
                      label={`Classe ${row.classe}`}
                      value={formatPercent(row.percentualAcumulado)}
                    />
                    <TooltipRow label="Receita" value={formatMoney(row.receita)} />
                    <TooltipRow
                      label="Quantidade"
                      value={formatInt(row.quantidade)}
                    />
                    <TooltipRow label="Pedidos" value={formatInt(row.pedidos)} />
                  </TooltipShell>
                );
              }}
            />
            <Bar
              dataKey="receita"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={animate}
            >
              {data.map((p) => (
                // 2px de respiro na cor da superfície entre barras vizinhas,
                // para que dois blocos de mesma classe não virem um só.
                <Cell
                  key={p.productId}
                  fill={CLASS_COLOR[p.classe]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {produtos.length > MAX_BARS && (
        <p className="mt-2 text-xs text-ink-muted">
          Mostrando os {MAX_BARS} maiores por receita. Os {produtos.length}{" "}
          produtos do período estão na tabela abaixo.
        </p>
      )}
    </div>
  );
}

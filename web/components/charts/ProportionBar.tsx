/**
 * Barra de proporção — duas partes de um todo.
 *
 * Por que não uma rosca/pizza: com DUAS fatias, um donut gasta muito espaço
 * para dizer pouco, e comparar ângulos é pior que comparar comprimentos. Uma
 * barra 100% empilhada com rótulo direto em cada parte resolve melhor.
 *
 * Não é Client Component: não tem estado nem hover — os valores estão escritos.
 * Um tooltip aqui seria redundante.
 */
export interface Segment {
  label: string;
  value: number;
  color: string;
  /** Texto já formatado (ex.: "42,5%"). */
  display: string;
}

export function ProportionBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div>
      {/* 2px de gap na cor do fundo entre segmentos: sem isso, duas cores
          adjacentes criam uma terceira borda visual que não é dado. */}
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${s.display}`)
          .join(", ")}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              style={{
                width: `${(s.value / total) * 100}%`,
                background: s.color,
              }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>

      {/* Rótulo direto — a identidade nunca depende só da cor. */}
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="text-sm text-ink-secondary">{s.label}</span>
            <span className="tnum text-sm font-semibold text-ink">
              {s.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

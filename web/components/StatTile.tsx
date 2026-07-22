/**
 * O número-herói. Quatro data points ou menos não merecem gráfico — merecem
 * este bloco: rótulo pequeno, valor grande, e uma linha de contexto que diz de
 * onde ele saiu.
 */
interface StatTileProps {
  label: string;
  value: string;
  context?: string;
  /** Destaca o valor com a cor da série 1 quando é O número da tela. */
  emphasis?: boolean;
}

export function StatTile({ label, value, context, emphasis }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd
        className={`tnum mt-1 text-2xl font-semibold tracking-tight ${
          emphasis ? "text-primary" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {context && <p className="mt-1 text-xs text-ink-muted">{context}</p>}
    </div>
  );
}

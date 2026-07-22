import type { ReactNode } from "react";

interface CardProps {
  title: string;
  /** Uma linha dizendo o que o número significa. Evita rodapé explicativo. */
  hint?: string;
  /** Controles à direita do título (ex.: alternar tabela). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, hint, action, children, className }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-border-subtle bg-surface ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

import type { ReactNode } from "react";
import { HintTooltip } from "@/components/HintTooltip";

interface CardProps {
  title: string;
  /** Uma linha dizendo o que o número significa. Vive num tooltip, não solta no card. */
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
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint && <HintTooltip text={hint} />}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

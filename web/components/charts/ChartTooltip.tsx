"use client";

import type { ReactNode } from "react";

/**
 * Casca visual do tooltip, compartilhada por todos os gráficos.
 *
 * Um gráfico em HTML É interativo — o tooltip não é enfeite, é como o usuário
 * lê o valor exato sem poluir o gráfico com um número em cima de cada ponto.
 */
export function TooltipShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-strong bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-ink">{title}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Uma linha do tooltip: marca colorida + rótulo em tinta de TEXTO + valor.
 * O texto nunca veste a cor da série — a marca ao lado é que carrega a
 * identidade; texto colorido perde contraste e vira decoração.
 */
export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-secondary">
      {color && (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-sm"
          style={{ background: color }}
        />
      )}
      <span>{label}</span>
      <span className="tnum ml-auto font-medium text-ink">{value}</span>
    </p>
  );
}

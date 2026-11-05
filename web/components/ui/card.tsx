import type { ComponentProps } from "react";

/** A superfície branca do painel (mesma sombra do estado vazio do anunciante). */
export const cardClasses = "rounded-2xl bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.08)]";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section {...props} className={`${cardClasses} p-5 sm:p-6 ${className}`} />;
}

/** Selo de status. Neutro de propósito: a cor fica para o que pede ação. */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "positive" | "warning" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-secondary",
    positive: "bg-positive/10 text-positive",
    warning: "bg-warning/10 text-warning",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

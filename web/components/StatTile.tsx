/**
 * O número-herói. Quatro data points ou menos não merecem gráfico — merecem
 * este bloco: rótulo pequeno, valor grande, e uma linha de contexto que diz de
 * onde ele saiu.
 *
 * O tile em destaque (`emphasis`) marca O número da tela com DOIS sinais, não
 * só a cor: valor maior e o azul da ação. Cor sozinha some em escala de cinza e
 * para quem não distingue o azul — aí os tiles ficariam idênticos e o herói
 * desapareceria. O tamanho sobrevive aos dois casos.
 */
import { HintTooltip } from "@/components/HintTooltip";

interface StatTileProps {
  label: string;
  value: string;
  context?: string;
  /**
   * Manda o `context` para um tooltip (ícone "i" ao lado do rótulo) em vez de
   * texto solto embaixo do valor. Opt-in: em telas como Região ou Cupons o
   * `context` carrega um número que dá escala ao valor — esconder atrás de
   * hover tiraria dado da vista. Use quando `context` for só explicação.
   */
  contextInTooltip?: boolean;
  /** Marca o valor como O número da tela: maior e na cor da ação. */
  emphasis?: boolean;
}

export function StatTile({
  label,
  value,
  context,
  contextInTooltip,
  emphasis,
}: StatTileProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {label}
        {context && contextInTooltip && <HintTooltip text={context} />}
      </dt>
      <dd
        className={`tnum mt-1 font-semibold tracking-tight ${
          emphasis ? "text-3xl text-primary" : "text-2xl text-ink"
        }`}
      >
        {value}
      </dd>
      {context && !contextInTooltip && (
        <p className="mt-1 text-xs text-ink-muted">{context}</p>
      )}
    </div>
  );
}

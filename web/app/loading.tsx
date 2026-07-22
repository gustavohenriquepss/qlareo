import { LogoMark } from "@/components/Logo";

/**
 * Estado de carregamento da rota. Esqueleto com a FORMA da tela real (três
 * indicadores + um painel grande), não um spinner centralizado: o layout não
 * salta quando os dados chegam, e o usuário já entende o que vem.
 *
 * A marca aparece DENTRO da caixa do gráfico, que já existe e já tem a altura
 * final — então ela não é um elemento a mais que some e desloca o resto. É o
 * único lugar onde a logo cabe num esqueleto sem virar splash screen.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando relatório">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-7 w-32 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="p-4">
          <div className="flex h-72 w-full animate-pulse items-center justify-center rounded bg-surface-2">
            {/* `opacity-30`: presença de marca, não elemento de interface. Em
                cima do pulse do pai ela respira junto com o resto do esqueleto,
                sem precisar de animação própria. */}
            <LogoMark className="h-10 w-10 opacity-30" />
          </div>
        </div>
      </div>
    </div>
  );
}

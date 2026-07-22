/**
 * Estados que não são "dados".
 *
 * Um relatório de vendas tem três jeitos honestos de não mostrar números, e
 * confundi-los custa confiança:
 *   - ERRO: o serviço falhou. Diga o que fazer.
 *   - VAZIO: o período não tem pedido. Não é erro.
 *   - NÃO SINCRONIZADO: há pedidos, mas sem detalhe de item. "R$ 0,00 de
 *     desconto" aqui seria MENTIRA — não sabemos ainda.
 * Nenhum deles usa cor sozinha: todos têm ícone + texto.
 */

function Frame({
  tone,
  icon,
  title,
  children,
}: {
  tone: "error" | "neutral" | "warning";
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const border =
    tone === "error"
      ? "border-negative/30"
      : tone === "warning"
        ? "border-warning/40"
        : "border-border-subtle";
  const color =
    tone === "error"
      ? "text-negative"
      : tone === "warning"
        ? "text-warning"
        : "text-ink-muted";

  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`flex items-start gap-3 rounded-lg border ${border} bg-surface px-4 py-6`}
    >
      <span className={`mt-0.5 shrink-0 ${color}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children && (
          <div className="mt-1 text-sm text-ink-secondary">{children}</div>
        )}
      </div>
    </div>
  );
}

const IconAlert = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconEmpty = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconSync = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

export function ErrorState({ error, hint }: { error: string; hint?: string }) {
  return (
    <Frame tone="error" icon={IconAlert} title={error}>
      {hint && <p>{hint}</p>}
    </Frame>
  );
}

export function EmptyState({
  title = "Nenhum pedido neste período.",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Frame tone="neutral" icon={IconEmpty} title={title}>
      {children ?? (
        <p>
          Amplie o intervalo, troque o recorte, ou rode o sync para trazer os
          pedidos da VTEX para o banco.
        </p>
      )}
    </Frame>
  );
}

/**
 * Caso específico dos relatórios de item: o backend responde
 * `itensNaoSincronizados` em vez de zeros, e a UI precisa repetir essa
 * distinção em vez de achatar tudo em "sem dados".
 */
export function NotSyncedState({
  totalPedidos,
  mensagem,
}: {
  totalPedidos: number;
  mensagem: string;
}) {
  return (
    <Frame
      tone="warning"
      icon={IconSync}
      title={`${totalPedidos} pedido${totalPedidos === 1 ? "" : "s"} no período, sem detalhe de item sincronizado.`}
    >
      <p>{mensagem}</p>
      <pre className="mt-2 overflow-x-auto rounded bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
        npm run sync -- --items
      </pre>
    </Frame>
  );
}

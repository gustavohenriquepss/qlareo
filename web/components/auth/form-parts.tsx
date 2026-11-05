/** Peças repetidas entre as telas de acesso. */

export function AuthHeading({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {lead ? <p className="text-ink-secondary">{lead}</p> : null}
    </div>
  );
}

/** Erro do formulário inteiro. `role="alert"` faz o leitor de tela anunciar na hora. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
      {message}
    </p>
  );
}

/** Aviso de "enviamos um e-mail", que substitui o formulário. */
export function SentNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      {/* h2: a página já tem o h1 dela (AuthHeading). */}
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-ink-secondary">{children}</div>
    </div>
  );
}

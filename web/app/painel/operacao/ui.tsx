import Link from "next/link";

/** Peças repetidas nas telas de operação. */

export function PageHeading({
  title,
  lead,
  back,
  action,
}: {
  title: string;
  lead?: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Link href={back.href} className="self-start text-sm font-medium text-ink-secondary hover:text-ink">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {lead ? <div className="text-ink-secondary">{lead}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border-strong px-5 py-8 sm:px-6">
      <h2 className="font-semibold text-ink">{title}</h2>
      <div className="max-w-prose text-ink-secondary">{children}</div>
    </div>
  );
}

/** Aviso de "salvo", anunciado pelo leitor de tela. */
export function SavedNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-positive">
      {message}
    </p>
  );
}

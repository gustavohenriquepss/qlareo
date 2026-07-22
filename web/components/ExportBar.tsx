/**
 * Exportação em CSV do relatório aberto, com os filtros atuais.
 *
 * Server Component de propósito: são links `<a href download>` comuns, sem
 * estado e sem JavaScript. Ganha-se com isso o menu de contexto do navegador
 * ("salvar como", "abrir em nova aba"), o gerenciador de downloads e o
 * anúncio como link em leitor de tela — coisas que um `<button>` que monta um
 * `Blob` teria de reimplementar mal.
 *
 * `<a>` puro, não `<Link>`: o roteador do Next interceptaria a navegação e
 * tentaria renderizar o CSV como página.
 */
import {
  EXPORTS,
  PAGE_EXPORTS,
  type ExportKey,
  type ExportPage,
} from "@/lib/exports";
import { filtersToSearchParams, type Filters } from "@/lib/filters";

export function ExportBar({
  page,
  filters,
}: {
  page: ExportPage;
  filters: Filters;
}) {
  const keys: ReadonlyArray<ExportKey> = PAGE_EXPORTS[page];
  const qs = filtersToSearchParams(filters).toString();
  const only = keys.length === 1;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!only && (
        <span aria-hidden="true" className="text-xs text-ink-muted">
          Exportar CSV:
        </span>
      )}

      {keys.map((key) => (
        <a
          key={key}
          href={`/api/export/${key}?${qs}`}
          download
          // Rótulo acessível completo em cada link. Quando há vários, o texto
          // visível é só o recorte ("Por seller") e depende do "Exportar CSV:"
          // ao lado — proximidade visual que não chega a quem navega por lista
          // de links.
          aria-label={`Exportar CSV: ${EXPORTS[key].label}`}
          className="control gap-1.5 rounded-md border border-border-subtle bg-surface px-3 text-sm text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
        >
          <DownloadIcon />
          {only ? "Exportar CSV" : EXPORTS[key].label}
        </a>
      ))}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

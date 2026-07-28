/**
 * Ícone "i" ao lado de um rótulo; o texto de apoio só aparece no hover/foco.
 * CSS puro (group-hover/group-focus-within) para funcionar em Server
 * Components, sem precisar de "use client" nem JS no cliente.
 */
export function HintTooltip({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full text-ink-muted outline-none hover:text-ink focus-visible:text-ink"
        aria-label={text}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" />
          <path d="M8 7.25v3.5" stroke="currentColor" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs leading-relaxed text-ink opacity-0 shadow-md transition-opacity duration-100 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

import { useId, type ComponentProps } from "react";

/**
 * Campo de formulário com rótulo visível, dica e erro ligados por
 * `aria-describedby`. 48px de altura e 16px de fonte: abaixo de 16px o Safari
 * do iPhone dá zoom no campo ao focar.
 */
export function Field({
  label,
  hint,
  error,
  className = "",
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-12 rounded-xl border bg-surface px-4 text-base text-ink",
          "placeholder:text-ink-muted",
          error ? "border-negative" : "border-border-strong",
        ].join(" ")}
        {...input}
      />
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

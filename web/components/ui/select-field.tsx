import { useId, type ComponentProps } from "react";

/** Par do `Field` para `<select>`: mesmo rótulo, mesma altura, mesmo erro. */
export function SelectField({
  label,
  hint,
  error,
  className = "",
  children,
  ...select
}: ComponentProps<"select"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-12 rounded-xl border bg-surface px-3 text-base text-ink",
          error ? "border-negative" : "border-border-strong",
        ].join(" ")}
        {...select}
      >
        {children}
      </select>
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

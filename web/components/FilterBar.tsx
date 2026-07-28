"use client";

/**
 * Barra de filtros — período, recorte e granularidade, em UMA linha no topo da
 * área de conteúdo (o lugar onde o olho procura).
 *
 * Sem fundo próprio: os filtros descrevem o relatório que está logo abaixo,
 * então pintá-los de outra cor os anunciava como uma região à parte, que não
 * são. Uma régua de 1px separa o suficiente.
 *
 * Escreve na URL em vez de guardar estado local: a navegação vira um
 * Server Component render novo, com dados frescos, e o resultado é linkável e
 * sobrevive ao reload. `useTransition` mantém a barra interativa e mostra que
 * algo está acontecendo enquanto o servidor responde — sem isso, clicar num
 * atalho parece que não fez nada.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  GRAINS,
  SCOPES,
  defaultFilters,
  parseFilters,
  rangePresets,
  type Filters,
} from "@/lib/filters";

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = parseFilters(Object.fromEntries(searchParams.entries()));
  const presets = rangePresets();

  function apply(patch: Partial<Filters>) {
    const next = { ...current, ...patch };
    const params = new URLSearchParams({
      from: next.from,
      to: next.to,
      scope: next.scope,
      grain: next.grain,
    });
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const activePreset = presets.find(
    (p) => p.from === current.from && p.to === current.to,
  );
  const isDefault =
    JSON.stringify(current) === JSON.stringify(defaultFilters());

  // A granularidade muda o eixo das telas que desenham série temporal.
  // Nas outras ela não teria efeito visível, e um controle que não faz nada é
  // pior que um controle ausente.
  const showGrain = pathname === "/vendas" || pathname === "/cancelados";

  // O Recorte some em Cancelados pelo mesmo princípio, agora por um motivo mais
  // forte: ele não é inócuo ali, é CONTRADITÓRIO. "Líquido" existe justamente
  // para excluir cancelados, então oferecer o controle numa tela sobre eles
  // convida o usuário a pedir um recorte que a tela ignora — e um filtro que
  // não obedece é pior que um filtro ausente. O backend também ignora o
  // parâmetro nessa rota (ver server/reports.ts).
  const showScope = pathname !== "/cancelados";

  return (
    <div
      className="flex flex-wrap items-end gap-x-4 gap-y-3"
      aria-busy={isPending}
    >
      {/* Atalhos de período — o caminho mais rápido, primeiro. */}
      <Field label="Período">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => {
            const active = activePreset?.label === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => apply({ from: p.from, to: p.to, grain: p.grain })}
                aria-pressed={active}
                className={`control rounded-md border px-3 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border-subtle bg-surface text-ink-secondary hover:border-border-strong hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="De" htmlFor="filtro-de">
        <input
          id="filtro-de"
          type="date"
          value={current.from}
          max={current.to}
          onChange={(e) => e.target.value && apply({ from: e.target.value })}
          className="control rounded-md border border-border-subtle bg-surface px-3 text-sm text-ink"
        />
      </Field>

      <Field label="Até" htmlFor="filtro-ate">
        <input
          id="filtro-ate"
          type="date"
          value={current.to}
          min={current.from}
          onChange={(e) => e.target.value && apply({ to: e.target.value })}
          className="control rounded-md border border-border-subtle bg-surface px-3 text-sm text-ink"
        />
      </Field>

      {showScope && (
      <Field label="Recorte">
        <div
          role="group"
          aria-label="Recorte de vendas"
          className="flex overflow-hidden rounded-md border border-border-subtle"
        >
          {SCOPES.map((s) => {
            const active = current.scope === s.value;
            return (
              <button
                key={s.value}
                type="button"
                title={s.help}
                onClick={() => apply({ scope: s.value })}
                aria-pressed={active}
                className={`control border-r border-border-subtle px-3 text-sm transition-colors last:border-r-0 ${
                  active
                    ? "bg-primary text-on-primary"
                    : "bg-surface text-ink-secondary hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </Field>
      )}

      {showGrain && (
        <Field label="Agrupar por">
          <div
            role="group"
            aria-label="Granularidade"
            className="flex overflow-hidden rounded-md border border-border-subtle"
          >
            {GRAINS.map((g) => {
              const active = current.grain === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => apply({ grain: g.value })}
                  aria-pressed={active}
                  className={`control border-r border-border-subtle px-3 text-sm transition-colors last:border-r-0 ${
                    active
                      ? "bg-primary text-on-primary"
                      : "bg-surface text-ink-secondary hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {!isDefault && (
        <button
          type="button"
          onClick={() => apply(defaultFilters())}
          className="control px-2 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Limpar
        </button>
      )}

      {/* Feedback de carregamento: sem isto, um clique parece não ter efeito. */}
      <span
        role="status"
        aria-live="polite"
        className={`control flex items-center gap-2 text-xs text-ink-muted transition-opacity ${
          isPending ? "opacity-100" : "opacity-0"
        }`}
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border-2 border-border-strong border-t-primary"
        />
        {isPending ? "Atualizando…" : ""}
      </span>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Rótulo VISÍVEL, não placeholder: o usuário precisa saber o que o
          campo é depois de preenchê-lo. */}
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-ink-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

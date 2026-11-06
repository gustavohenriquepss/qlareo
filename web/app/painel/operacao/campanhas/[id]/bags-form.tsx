"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../../actions";
import { SavedNotice } from "../../ui";

export type BagsRow = { id: string; name: string; place: string; bags: number };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (linkId: string) => Promise<void>;
  rows: BagsRow[];
};

type Versioned = ActionState & { version: number };

/*
  Uma linha por restaurante, com o número de sacolas que foram para ele.
  Mesma remontagem por versão do formulário de campanha: depois de um erro, os
  campos voltam com o que foi digitado, e não com o valor salvo.
*/
export function BagsForm({ action: submit, ...props }: Props) {
  const [state, action, pending] = useActionState<Versioned, FormData>(
    async (prev, formData) => ({ ...(await submit(prev, formData)), version: prev.version + 1 }),
    { status: "idle", version: 0 },
  );
  return <BagsFormBody key={state.version} state={state} action={action} pending={pending} {...props} />;
}

function BagsFormBody({
  state,
  action,
  pending,
  remove,
  rows,
}: Omit<Props, "action"> & { state: ActionState; action: (formData: FormData) => void; pending: boolean }) {
  const fields = state.status === "error" ? state.fields : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const total = rows.reduce((sum, r) => sum + r.bags, 0);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <SavedNotice message={state.status === "saved" ? state.message : undefined} />

      <ul className="flex flex-col divide-y divide-border-subtle">
        {rows.map((r) => {
          const name = `bags:${r.id}`;
          const error = fields?.[name];
          const errorId = `${name}-erro`;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <label htmlFor={name} className="font-medium text-ink">
                  {r.name}
                </label>
                <p className="text-sm text-ink-muted">{r.place}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <input
                    id={name}
                    name={name}
                    inputMode="numeric"
                    autoComplete="off"
                    defaultValue={values?.[name] ?? String(r.bags)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={`tnum min-h-11 w-28 rounded-xl border bg-surface px-3 text-right text-base text-ink ${error ? "border-negative" : "border-border-strong"}`}
                  />
                  <span className="text-sm text-ink-muted">sacolas</span>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    formAction={remove.bind(null, r.id)}
                    formNoValidate
                    className="text-negative"
                    aria-label={`Tirar ${r.name} da campanha`}
                  >
                    Tirar
                  </Button>
                </div>
                {error ? (
                  <p id={errorId} className="text-sm text-negative">
                    {error}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <p className="text-sm text-ink-secondary">
          Total salvo: <span className="tnum font-semibold text-ink">{total.toLocaleString("pt-BR")}</span> sacolas
        </p>
        <Button type="submit" size="md" disabled={pending}>
          {pending ? "Salvando…" : "Salvar sacolas"}
        </Button>
      </div>
    </form>
  );
}

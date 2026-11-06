"use client";

import { useActionState, useId } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../operacao/actions";
import { SavedNotice } from "../operacao/ui";

type Props = { action: (prev: ActionState, formData: FormData) => Promise<ActionState> };

type Versioned = ActionState & { version: number };

/*
  Revisão da versão atual, pelo operador. Aprovar quer dizer que a Qlareo
  conferiu e o restaurante aprovou (pelo WhatsApp). Pedir ajuste exige a nota,
  que o anunciante lê no painel dele.

  Mesma remontagem por versão dos outros formulários: depois de um erro, a nota
  volta com o que foi digitado.
*/
export function ReviewForm({ action: submit }: Props) {
  const [state, action, pending] = useActionState<Versioned, FormData>(
    async (prev, formData) => ({ ...(await submit(prev, formData)), version: prev.version + 1 }),
    { status: "idle", version: 0 },
  );
  return <ReviewFormBody key={state.version} state={state} action={action} pending={pending} />;
}

function ReviewFormBody({
  state,
  action,
  pending,
}: {
  state: ActionState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const id = useId();
  const error = state.status === "error" ? state.fields?.review_note : undefined;
  const value = state.status === "error" ? state.values?.review_note : undefined;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <SavedNotice message={state.status === "saved" ? state.message : undefined} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Nota da revisão
        </label>
        <textarea
          id={id}
          name="review_note"
          rows={2}
          maxLength={1000}
          defaultValue={value ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-${error ? "erro" : "dica"}`}
          className={`rounded-xl border bg-surface px-4 py-3 text-base text-ink ${error ? "border-negative" : "border-border-strong"}`}
        />
        {error ? (
          <p id={`${id}-erro`} className="text-sm text-negative">
            {error}
          </p>
        ) : (
          <p id={`${id}-dica`} className="text-sm text-ink-muted">
            Para ajuste, diga o que mudar. Para aprovar, se quiser, quem aprovou (ex.: Cantina, no WhatsApp).
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="aprovada" size="sm" disabled={pending}>
          Aprovar
        </Button>
        <Button type="submit" name="decision" value="ajustes" size="sm" variant="secondary" disabled={pending}>
          Pedir ajuste
        </Button>
      </div>
    </form>
  );
}

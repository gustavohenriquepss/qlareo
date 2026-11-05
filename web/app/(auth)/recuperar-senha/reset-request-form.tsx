"use client";

import { useActionState } from "react";
import { FormError, SentNotice } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { requestPasswordReset, type FormState } from "../actions";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <SentNotice title="Confira seu e-mail">
        {/* Mesma resposta exista a conta ou não: não contamos quem tem conta. */}
        <p>
          Se existir uma conta com <strong className="text-ink">{state.email}</strong>, enviamos um link para
          criar uma senha nova.
        </p>
        <p className="text-sm text-ink-muted">O link vale por uma hora.</p>
      </SentNotice>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.status === "error" ? state.values?.email : undefined} />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Enviando…" : "Enviar link"}
      </Button>
    </form>
  );
}

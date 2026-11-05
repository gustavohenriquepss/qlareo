"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { updatePassword, type FormState } from "../actions";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, { status: "idle" });
  const fields = state.status === "error" ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres, com letras e números."
        required
        error={fields?.password || undefined}
      />
      <Field
        label="Repita a nova senha"
        name="password_confirm"
        type="password"
        autoComplete="new-password"
        required
        error={fields?.password_confirm}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Salvando…" : "Salvar senha"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { signIn, type FormState } from "../actions";

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.status === "error" ? state.message : notice} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.status === "error" ? state.values?.email : undefined} />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

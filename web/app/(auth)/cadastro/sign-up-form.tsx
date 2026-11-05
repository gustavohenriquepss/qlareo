"use client";

import { useActionState } from "react";
import { FormError, SentNotice } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { signUp, type FormState } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, { status: "idle" });

  if (state.status === "sent") {
    return (
      <SentNotice title="Confirme seu e-mail">
        <p>
          Enviamos um link para <strong className="text-ink">{state.email}</strong>. Abra o link para
          ativar sua conta.
        </p>
        <p className="text-sm text-ink-muted">Não chegou? Procure no spam ou na aba Promoções.</p>
      </SentNotice>
    );
  }

  const fields = state.status === "error" ? state.fields : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <Field label="Seu nome" name="full_name" autoComplete="name" required defaultValue={values?.full_name} error={fields?.full_name} />
      <Field
        label="Nome da empresa"
        name="company_name"
        autoComplete="organization"
        required
        defaultValue={values?.company_name}
        error={fields?.company_name}
      />
      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={values?.email}
        error={fields?.email}
      />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres, com letras e números."
        required
        error={fields?.password}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}

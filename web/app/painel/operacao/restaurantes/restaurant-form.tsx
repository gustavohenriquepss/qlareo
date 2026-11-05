"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { ActionState } from "../actions";
import { SavedNotice } from "../ui";

/** Cidades do piloto, sugeridas no campo (ainda dá para digitar outra). */
const CITIES = ["Itaboraí", "Niterói"];

type Restaurant = { name: string; city: string; neighborhood: string | null };

export function RestaurantForm({
  action: submit,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Restaurant;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submit, { status: "idle" });
  const fields = state.status === "error" ? state.fields : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <SavedNotice message={state.status === "saved" ? state.message : undefined} />
      <Field
        label="Nome"
        name="name"
        required
        autoComplete="off"
        defaultValue={values?.name ?? initial?.name}
        error={fields?.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Cidade"
          name="city"
          required
          list="cidades-piloto"
          autoComplete="off"
          defaultValue={values?.city ?? initial?.city}
          error={fields?.city}
        />
        <Field
          label="Bairro"
          name="neighborhood"
          hint="Opcional"
          autoComplete="off"
          defaultValue={values?.neighborhood ?? initial?.neighborhood ?? undefined}
          error={fields?.neighborhood}
        />
      </div>
      <datalist id="cidades-piloto">
        {CITIES.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

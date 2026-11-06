"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../../actions";
import { SavedNotice } from "../../ui";

type Option = { id: string; name: string; place: string };

export function AddRestaurantsForm({
  action: submit,
  restaurants,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  restaurants: Option[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submit, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.status === "error" ? state.message : undefined} />
      <SavedNotice message={state.status === "saved" ? state.message : undefined} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Restaurantes para adicionar</legend>
        {restaurants.map((r) => (
          <label
            key={r.id}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border-strong px-4 py-2 has-checked:border-primary has-checked:bg-primary/5"
          >
            <input type="checkbox" name="restaurant_id" value={r.id} className="size-4 accent-[var(--primary)]" />
            <span className="flex flex-col">
              <span className="font-medium text-ink">{r.name}</span>
              <span className="text-sm text-ink-muted">{r.place}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="md" disabled={pending} className="self-start">
        {pending ? "Adicionando…" : "Adicionar restaurantes"}
      </Button>
    </form>
  );
}

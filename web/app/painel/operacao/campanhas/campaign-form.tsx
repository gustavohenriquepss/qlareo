"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { SIDES, SIDES_HINT, SIDES_LABEL, STATUS_LABEL, STATUSES, type Sides } from "@/lib/campanhas";
import type { ActionState } from "../actions";
import { SavedNotice } from "../ui";

export type AdvertiserOption = { id: string; name: string; email: string | null };

export type CampaignDefaults = {
  advertiser_id?: string;
  name?: string;
  sides?: string;
  destination_url?: string;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: string;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  advertisers: AdvertiserOption[];
  initial?: CampaignDefaults;
  withStatus?: boolean;
  submitLabel: string;
};

type Versioned = ActionState & { version: number };

/*
  O React 19 reseta o formulário depois de cada envio, e `<select>` e rádio
  não pegam o `defaultValue` novo: depois de um erro, o anunciante escolhido
  voltava para "Escolha…" e a arte para um lado. Cada resposta ganha uma
  versão, e os campos remontam com ela, já com o que foi digitado.
*/
export function CampaignForm({ action: submit, ...props }: Props) {
  const [state, action, pending] = useActionState<Versioned, FormData>(
    async (prev, formData) => ({ ...(await submit(prev, formData)), version: prev.version + 1 }),
    { status: "idle", version: 0 },
  );
  return <CampaignFormBody key={state.version} state={state} action={action} pending={pending} {...props} />;
}

function CampaignFormBody({
  state,
  action,
  pending,
  advertisers,
  initial = {},
  withStatus = false,
  submitLabel,
}: Omit<Props, "action"> & { state: ActionState; action: (formData: FormData) => void; pending: boolean }) {
  const fields = state.status === "error" ? state.fields : undefined;
  const values: CampaignDefaults = (state.status === "error" ? state.values : undefined) ?? initial;
  const sides = values.sides || "um_lado";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <SavedNotice message={state.status === "saved" ? state.message : undefined} />

      <SelectField
        label="Anunciante"
        name="advertiser_id"
        required
        defaultValue={values.advertiser_id ?? ""}
        error={fields?.advertiser_id}
        hint="O anunciante aparece aqui depois de criar a conta no painel."
      >
        <option value="" disabled>
          Escolha…
        </option>
        {advertisers.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email ? `${a.name} (${a.email})` : a.name}
          </option>
        ))}
      </SelectField>

      <Field
        label="Nome da campanha"
        name="name"
        required
        autoComplete="off"
        hint="Para você e para o anunciante reconhecerem. Ex.: Black Friday 2026"
        defaultValue={values.name}
        error={fields?.name}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-ink">Arte na sacola</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SIDES.map((p: Sides) => (
            <label
              key={p}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 has-checked:border-primary has-checked:bg-primary/5"
            >
              <input
                type="radio"
                name="sides"
                value={p}
                defaultChecked={sides === p}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="flex flex-col">
                <span className="font-semibold text-ink">{SIDES_LABEL[p]}</span>
                <span className="text-sm text-ink-muted">{SIDES_HINT[p]}</span>
              </span>
            </label>
          ))}
        </div>
        {fields?.sides ? <p className="text-sm text-negative">{fields.sides}</p> : null}
      </fieldset>

      <Field
        label="Para onde o QR leva"
        name="destination_url"
        required
        inputMode="url"
        autoComplete="off"
        placeholder="wa.me/5521999999999"
        hint="Site, Instagram ou WhatsApp do anunciante. Dá para trocar depois sem reimprimir a sacola."
        defaultValue={values.destination_url}
        error={fields?.destination_url}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início" name="starts_on" type="date" hint="Opcional" defaultValue={values.starts_on ?? undefined} error={fields?.starts_on} />
        <Field label="Fim" name="ends_on" type="date" hint="Opcional" defaultValue={values.ends_on ?? undefined} error={fields?.ends_on} />
      </div>

      {withStatus ? (
        <SelectField label="Status" name="status" required defaultValue={values.status} error={fields?.status}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

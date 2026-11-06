"use client";

import { useId, useRef, useState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { ARTWORK_ACCEPT, artworkType, checkArtworkFile, sizeLabel, type ArtworkSide } from "@/lib/artes";
import { finishArtworkUpload, startArtworkUpload } from "./actions";

type Props = {
  campaignId: string;
  side: ArtworkSide;
  /** "Arte", "Frente" ou "Verso", para o rótulo do campo. */
  label: string;
  /** Já existe versão: o botão vira "Enviar nova versão". */
  replacing: boolean;
  /** Aviso depois do envio: o anunciante espera a revisão; o operador só confirma. */
  sentMessage: string;
};

type Phase = { kind: "idle" } | { kind: "sending"; percent: number } | { kind: "error"; message: string } | { kind: "sent" };

/*
  Envio de uma arte. O arquivo sobe do navegador direto para o Storage, com
  barra de progresso: arte de gráfica passa fácil de 20 MB, e no 4G isso demora.
*/
export function ArtworkUploadForm({ campaignId, side, label, replacing, sentMessage }: Props) {
  const inputId = useId();
  const errorId = `${inputId}-erro`;
  const hintId = `${inputId}-dica`;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const sending = phase.kind === "sending";

  function choose(next: File | null) {
    setFile(next);
    const problem = next ? checkArtworkFile(next) : null;
    setPhase(problem ? { kind: "error", message: problem } : { kind: "idle" });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setPhase({ kind: "error", message: "Escolha o arquivo da arte." });
    const problem = checkArtworkFile(file);
    if (problem) return setPhase({ kind: "error", message: problem });

    setPhase({ kind: "sending", percent: 0 });
    const type = artworkType(file)!;
    const ticket = await startArtworkUpload(campaignId, side, { name: file.name, type, size: file.size });
    if (!ticket.ok) return setPhase({ kind: "error", message: ticket.message });

    const uploaded = await put(ticket.url, file, type, (percent) => setPhase({ kind: "sending", percent }));
    if (!uploaded) return setPhase({ kind: "error", message: "O envio caiu no meio. Confira a internet e tente de novo." });

    const result = await finishArtworkUpload(campaignId, side, ticket.path, file.name);
    if (!result.ok) return setPhase({ kind: "error", message: result.message });

    setFile(null);
    if (input.current) input.current.value = "";
    setPhase({ kind: "sent" });
  }

  const error = phase.kind === "error" ? phase.message : undefined;

  return (
    <form onSubmit={send} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {replacing ? `Nova versão (${label.toLowerCase()})` : `Arquivo (${label.toLowerCase()})`}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ARTWORK_ACCEPT}
          disabled={sending}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          className="min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-base text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
        {error ? null : (
          <p id={hintId} className="text-sm text-ink-muted">
            {file ? `${file.name} · ${sizeLabel(file.size)}` : "PDF, PNG ou JPG, até 50 MB."}
          </p>
        )}
      </div>

      {error ? (
        <div id={errorId}>
          <FormError message={error} />
        </div>
      ) : null}
      {phase.kind === "sent" ? (
        <p role="status" className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-positive">
          {sentMessage}
        </p>
      ) : null}

      {sending ? (
        <div className="flex flex-col gap-1.5" role="status">
          <div
            role="progressbar"
            aria-label="Envio da arte"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase.percent}
            className="h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${phase.percent}%` }} />
          </div>
          <p className="tnum text-sm text-ink-secondary">Enviando… {phase.percent}%</p>
        </div>
      ) : null}

      <Button type="submit" size="md" disabled={sending || !file} className="self-start">
        {sending ? "Enviando…" : replacing ? "Enviar nova versão" : "Enviar arte"}
      </Button>
    </form>
  );
}

/** PUT na URL assinada. XHR, e não `fetch`, porque só ele conta o progresso do envio. */
function put(url: string, file: File, type: string, onProgress: (percent: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(file);
  });
}

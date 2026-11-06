import { Badge } from "@/components/ui/card";
import {
  allApproved,
  ARTWORK_STATUS_LABEL,
  artworkTone,
  formatMoment,
  sideLabel,
  sidesOf,
  sizeLabel,
  versionsOf,
  type ArtworkRow,
  type ArtworkVersion,
} from "@/lib/artes";
import type { Sides, Status } from "@/lib/campanhas";
import { reviewArtwork } from "./actions";
import { ReviewForm } from "./review-form";
import { ArtworkUploadForm } from "./upload-form";

type Props = {
  campaign: { id: string; sides: Sides; status: Status };
  artworks: ArtworkRow[];
  /** O operador revisa e envia a qualquer momento; o anunciante só envia enquanto a campanha espera arte. */
  mode: "anunciante" | "operador";
};

/** As artes de uma campanha, um bloco por lado comprado, com a versão atual e o histórico. */
export function ArtworkPanel({ campaign, artworks, mode }: Props) {
  const operator = mode === "operador";
  const canSend = operator || campaign.status === "aguardando_arte";
  const sides = sidesOf(campaign.sides);

  return (
    <div className="flex flex-col gap-4">
      {operator && campaign.status === "aguardando_arte" && allApproved(artworks, campaign.sides) ? (
        <p role="status" className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-positive">
          {sides.length > 1 ? "As duas artes estão aprovadas." : "A arte está aprovada."} Mude o status para
          “Em produção” em Dados da campanha quando mandar para a gráfica.
        </p>
      ) : null}
      {!operator && !canSend ? (
        <p className="text-sm text-ink-secondary">
          A arte já foi para a gráfica. Para mudar alguma coisa, fale com a Qlareo.
        </p>
      ) : null}

      <div className={`grid gap-4 ${sides.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {sides.map((side) => {
          const versions = versionsOf(artworks, side);
          const [current, ...older] = versions;
          const label = sideLabel(side, campaign.sides);
          return (
            <div key={side} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-ink">{label}</h4>
                {current ? (
                  <Badge tone={artworkTone(current.status)}>{ARTWORK_STATUS_LABEL[current.status]}</Badge>
                ) : canSend ? (
                  <Badge tone="warning">Falta enviar</Badge>
                ) : (
                  <Badge>Sem arte no painel</Badge>
                )}
              </div>

              {current ? (
                <Version v={current} />
              ) : (
                <p className="text-sm text-ink-secondary">
                  {operator
                    ? "Nenhuma versão ainda. Se o anunciante mandar pelo WhatsApp, suba aqui."
                    : canSend
                      ? "Mande a arte pronta. A Qlareo confere e mostra ao restaurante antes de imprimir."
                      : "Nenhuma versão enviada por aqui."}
                </p>
              )}

              {operator && current ? <ReviewForm key={current.id} action={reviewArtwork.bind(null, current.id)} /> : null}

              {canSend ? (
                <ArtworkUploadForm
                  campaignId={campaign.id}
                  side={side}
                  label={label}
                  replacing={Boolean(current)}
                  sentMessage={operator ? "Versão enviada." : "Arte enviada. A Qlareo confere e avisa por aqui."}
                />
              ) : null}

              {older.length ? (
                <details className="group text-sm">
                  <summary className="cursor-pointer font-medium text-ink-secondary hover:text-ink">
                    {older.length === 1 ? "1 versão anterior" : `${older.length} versões anteriores`}
                  </summary>
                  <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
                    {older.map((v) => (
                      <li key={v.id} className="py-3 first:pt-0 last:pb-0">
                        <Version v={v} compact />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Version({ v, compact = false }: { v: ArtworkVersion; compact?: boolean }) {
  const href = `/painel/artes/${v.id}`;
  const image = v.content_type.startsWith("image/");
  return (
    <div className="flex min-w-0 gap-3">
      {compact ? null : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2"
          aria-label={`Abrir ${v.file_name}`}
        >
          {image ? (
            // Miniatura pela rota da arte (URL assinada de um minuto); `next/image` não otimiza isso.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={href} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="text-xs font-semibold text-ink-secondary">PDF</span>
          )}
        </a>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-ink">Versão {v.version}</span>
          {compact ? <Badge tone={artworkTone(v.status)}>{ARTWORK_STATUS_LABEL[v.status]}</Badge> : null}
        </p>
        <p className="truncate text-sm text-ink-secondary" title={v.file_name}>
          {v.file_name} · {sizeLabel(v.size_bytes)}
        </p>
        <p className="text-sm text-ink-muted">Enviada em {formatMoment(v.created_at)}</p>
        {v.review_note ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${v.status === "ajustes" ? "bg-warning/10 text-ink" : "bg-surface-2 text-ink-secondary"}`}
          >
            <span className="font-semibold">{v.status === "ajustes" ? "O que ajustar: " : "Nota da Qlareo: "}</span>
            {v.review_note}
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-4 text-sm">
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary-hover">
            Abrir
          </a>
          <a href={`${href}?baixar`} className="font-medium text-primary hover:text-primary-hover">
            Baixar
          </a>
        </p>
      </div>
    </div>
  );
}

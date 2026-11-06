/**
 * Vocabulário e validação das artes. Sem dependência de servidor: o formulário
 * de envio confere o arquivo antes de subir, e o servidor confere de novo.
 *
 * O banco e o bucket conferem tudo outra vez (`20261106000003_artes.sql`).
 */
import type { Sides } from "./campanhas";

export const ARTWORK_SIDES = ["frente", "verso"] as const;
export const ARTWORK_STATUSES = ["em_revisao", "ajustes", "aprovada"] as const;

export type ArtworkSide = (typeof ARTWORK_SIDES)[number];
export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

export const ARTWORK_STATUS_LABEL: Record<ArtworkStatus, string> = {
  em_revisao: "Em revisão",
  ajustes: "Pede ajuste",
  aprovada: "Aprovada",
};

export function artworkTone(status: ArtworkStatus) {
  if (status === "aprovada") return "positive" as const;
  if (status === "ajustes") return "warning" as const;
  return "neutral" as const;
}

/** Os lados que a campanha comprou: um lado só tem a frente. */
export function sidesOf(sides: Sides): ArtworkSide[] {
  return sides === "frente_e_verso" ? ["frente", "verso"] : ["frente"];
}

/** "Frente" e "Verso" na de dois lados; "Arte" na de um, onde não há verso. */
export function sideLabel(side: ArtworkSide, sides: Sides) {
  if (sides === "um_lado") return "Arte";
  return side === "frente" ? "Frente" : "Verso";
}

/** O mesmo teto do bucket `artes`. */
export const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;

const EXTENSIONS = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;

export type ArtworkType = keyof typeof EXTENSIONS;

export const ARTWORK_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

/**
 * Tipo do arquivo pelo que o navegador informa; se vier vazio (acontece no
 * Windows com alguns PDFs), pela extensão do nome.
 */
export function artworkType(file: { name: string; type: string }): ArtworkType | null {
  if (file.type in EXTENSIONS) return file.type as ArtworkType;
  if (file.type) return null;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

export function extensionOf(type: ArtworkType) {
  return EXTENSIONS[type];
}

/** Erro para mostrar no campo, ou `null` quando o arquivo serve. */
export function checkArtworkFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.size) return "O arquivo está vazio.";
  if (!artworkType(file)) return "Mande em PDF, PNG ou JPG.";
  if (file.size > MAX_ARTWORK_BYTES) return `O arquivo passa de 50 MB (tem ${sizeLabel(file.size)}).`;
  return null;
}

/** Nome guardado para mostrar e para o download: sem pasta, até 200 caracteres. */
export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  return (base || "arte").slice(0, 200);
}

/** "820 KB", "12,4 MB". */
export function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

const PATH_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f-]{36}\.(pdf|png|jpg)$/;

/** O caminho no bucket pertence a esta campanha? Mesmo padrão do check do banco. */
export function isArtworkPath(path: string, campaignId: string) {
  const match = PATH_RE.exec(path);
  return match !== null && match[1] === campaignId.toLowerCase();
}

export type ArtworkRow = {
  id: string;
  side: ArtworkSide;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: ArtworkStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ArtworkVersion = ArtworkRow & { version: number; current: boolean };

/**
 * As versões de um lado, da mais nova para a mais antiga. A versão é a ordem
 * de envio (1, 2, 3…), e só a mais nova vale: as outras ficam de histórico.
 */
export function versionsOf(rows: ArtworkRow[], side: ArtworkSide): ArtworkVersion[] {
  const own = rows.filter((r) => r.side === side).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return own.map((r, i) => ({ ...r, version: i + 1, current: i === own.length - 1 })).reverse();
}

/** Todos os lados comprados têm a versão mais nova aprovada? */
export function allApproved(rows: ArtworkRow[], sides: Sides) {
  return sidesOf(sides).every((side) => versionsOf(rows, side)[0]?.status === "aprovada");
}

/** "06/11/2026 às 14:05", no fuso do piloto (RJ). */
export function formatMoment(iso: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
}

/**
 * Contato da Qlareo. Mesmo número da landing (`qlareo-LP/lib/site.ts`): a venda
 * e o suporte acontecem no WhatsApp do fundador.
 */
export const WHATSAPP_NUMBER = "5521976173324";

export const LANDING_URL = "https://qlareo.com";

export function whatsappHref(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/**
 * Destino depois de um login ou de um link de e-mail. Só aceita caminho
 * interno: `?next=https://outro-site` viraria um redirect aberto.
 */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/painel") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

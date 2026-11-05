import "server-only";
import QRCode from "qrcode";

/**
 * Domínio que vai impresso no QR. Na Vercel é SEMPRE a produção, inclusive no
 * preview: o preview usa o mesmo banco e fica atrás de login, então um QR
 * gerado lá e mandado para a gráfica levaria a uma tela de login da Vercel.
 * Só no `npm run dev` local o QR aponta para a máquina, para dar para testar.
 */
export const APP_URL = "https://app.qlareo.com";

export function scanUrl(slug: string, requestOrigin: string) {
  const base = process.env.VERCEL ? APP_URL : requestOrigin;
  return `${base}/r/${slug}`;
}

/*
  Correção de erro Q (~25%): a sacola de papel amassa, mancha de gordura e
  dobra no fundo. H (~30%) deixaria o código mais denso sem ganho real para um
  link deste tamanho. Margem de 4 módulos é a zona de silêncio que a norma pede;
  sem ela, câmera de celular barato não acha o código.
*/
const OPTIONS = { errorCorrectionLevel: "Q", margin: 4, color: { dark: "#000000", light: "#ffffff" } } as const;

/** Vetor, para a gráfica: escala para qualquer tamanho sem serrilhar. */
export function qrSvg(url: string) {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" });
}

/** 2048px: dá ~17cm a 300dpi, mais do que qualquer QR de sacola. */
export function qrPng(url: string) {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png", width: 2048 });
}

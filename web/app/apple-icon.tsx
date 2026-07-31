import { ImageResponse } from "next/og";
import { BRAND_COLOR, MARK_PATHS } from "@/components/Logo";

/**
 * Ícone da tela de início do iOS. Gerado em código, e não como arquivo, por uma
 * limitação da convenção: `apple-icon` só aceita jpg/png (o `icon.svg` do lado
 * cobre navegador e Android), então em vez de versionar um PNG binário que
 * ninguém consegue revisar no diff, rasterizamos a MESMA geometria do
 * componente Logo. Uma fonte de verdade para o desenho.
 *
 * Fundo branco sólido de propósito: o iOS não respeita transparência aqui —
 * um PNG transparente vira um símbolo azul sobre preto na tela de início.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5.41992 5.41992 75.87738 75.87738" fill="${BRAND_COLOR}">${MARK_PATHS.map(
  (d) => `<path d="${d}"/>`,
).join("")}</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#ffffff",
        }}
      >
        {/* ~62% do lado: a folga que o iOS espera em volta do símbolo depois de
            aplicar o próprio arredondamento de canto. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`}
          alt=""
          width={112}
          height={112}
        />
      </div>
    ),
    size,
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/**
 * Inter, uma família só com variação de peso. A landing (qlareo.com) usa a
 * mesma: quem sai de lá e entra aqui não pode sentir que mudou de marca.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qlareo",
  description:
    "Painel do anunciante da Qlareo, a rede de mídia em sacolas de delivery.",
  // O app não é página de venda: quem chega aqui veio por link ou QR code.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` só no <html>: extensões de navegador escrevem
    // atributos na tag raiz antes do React hidratar. A supressão é rasa e não
    // esconde mismatch de nenhum componente nosso.
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

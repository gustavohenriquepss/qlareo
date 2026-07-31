import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { FilterBar } from "@/components/FilterBar";
import { fetchHealth } from "@/lib/api";

/**
 * Inter, uma família só com variação de peso ("Minimal Swiss"): é a escolha
 * padrão de painel/admin porque foi desenhada para texto de interface em
 * tamanho pequeno, e porque uma família só remove uma decisão de cada
 * componente. Números usam `tnum` (ver globals.css).
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "QLAREO — Relatórios de vendas",
  description:
    "Relatórios de vendas simples e confiáveis para lojistas VTEX: faturamento, clientes, curva ABC e efetividade de promoções.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` SÓ aqui, no <html>, e por um motivo específico:
    // extensões de navegador escrevem atributos na tag raiz antes do React
    // hidratar (crosspilot, Grammarly, gerenciadores de tema…), e o React trata
    // isso como mismatch — erro que aparece na máquina do usuário e não tem
    // correspondente no nosso código. A supressão é RASA: vale para os
    // atributos deste elemento, não para a árvore abaixo. Um mismatch de
    // verdade, em qualquer componente nosso, continua sendo reportado.
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background antialiased">
        {/* O cabeçalho guarda só identidade e estado do serviço. A navegação
            desceu para a coluna da esquerda (ver Nav). */}
        <header className="border-b border-border-subtle bg-surface">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Logo className="h-6 w-auto text-ink" />
            </div>
            <Suspense fallback={null}>
              <ServiceBadge />
            </Suspense>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
          {/* Coluna dos relatórios. Largura fixa: uma lista de navegação não
              deve crescer com a janela, o espaço extra é do conteúdo. */}
          <aside className="shrink-0 lg:w-56 lg:border-r lg:border-border-subtle lg:pr-4">
            <Suspense fallback={<div className="h-9 lg:h-40" />}>
              <Nav />
            </Suspense>
          </aside>

          {/* `min-w-0` é obrigatório: sem isso um filho flex tem largura mínima
              = conteúdo, e a tabela larga do relatório empurra a coluna para
              fora da tela em vez de rolar dentro do próprio `overflow-x-auto`. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Filtros sem faixa colorida: eles pertencem ao conteúdo, e uma
                régua fina basta para separá-los dele. */}
            <div className="border-b border-border-subtle pb-4">
              <Suspense fallback={<div className="h-14" />}>
                <FilterBar />
              </Suspense>
            </div>

            <main className="flex-1 pt-6">{children}</main>
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}

/**
 * Estado do serviço no cabeçalho. Mostra a conta VTEX que está sendo lida —
 * quem opera mais de uma loja precisa saber, à primeira vista, de qual conta
 * são os números na tela.
 */
async function ServiceBadge() {
  const health = await fetchHealth();

  if (!health.ok) {
    return (
      <span className="flex items-center gap-2 text-xs text-negative">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-negative" />
        Serviço indisponível
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs text-ink-muted">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-positive" />
      Conta <span className="font-medium text-ink">{health.data.account}</span>
    </span>
  );
}

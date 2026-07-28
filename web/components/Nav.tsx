"use client";

/**
 * Navegação entre os relatórios — lista VERTICAL, numa coluna à esquerda, com
 * um nível de recortes dentro de Vendas.
 *
 * Vertical porque os rótulos são frases ("Novos vs. recorrentes"), e frase em
 * aba horizontal ou quebra ou empurra as vizinhas para fora da tela. Na
 * vertical cada item tem a largura toda da coluna e o olho percorre uma pilha
 * de linhas alinhadas à esquerda.
 *
 * OS RECORTES DE VENDAS MORAM AQUI, não numa fita de sub-abas em cima do
 * gráfico. Duas consequências:
 *  - a área de dados fica com uma coisa só (filtros e conteúdo), sem um segundo
 *    nível de navegação disputando a atenção logo acima do primeiro gráfico;
 *  - toda a navegação do app está num lugar só, então a pergunta "onde estou e
 *    o que mais existe" tem uma resposta, não duas em lugares diferentes.
 *
 * ABRIR É NAVEGAR: a sublista aparece quando a rota está dentro de `/vendas`, e
 * some quando não está. Não há estado de "aberto" separado da URL — de
 * propósito. Um menu que lembra o que estava aberto pode mostrar uma seção
 * expandida que não é a que está na tela, e aí o menu passa a mentir sobre onde
 * o usuário está. Como efeito colateral: funciona antes da hidratação, sobrevive
 * ao reload e é linkável.
 *
 * Os links CARREGAM a query string atual. Trocar de relatório mantendo o
 * período e o recorte é o comportamento esperado — perder o filtro a cada troca
 * é o erro clássico de dashboard, e obriga o usuário a refazer o recorte quatro
 * vezes para responder uma pergunta só.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface Report {
  href: string;
  label: string;
  children?: ReadonlyArray<{ href: string; label: string }>;
}

const REPORTS: ReadonlyArray<Report> = [
  {
    href: "/vendas",
    label: "Vendas",
    children: [
      // O primeiro filho aponta para a mesma rota do pai: "Vendas" sem recorte
      // É o recorte por período. Ele existe como filho porque, com a seção
      // aberta, o usuário precisa de um alvo para VOLTAR ao período depois de
      // ir a pagamento ou seller.
      { href: "/vendas", label: "Período" },
      { href: "/vendas/pagamento", label: "Meio de pagamento" },
      { href: "/vendas/seller", label: "Seller" },
    ],
  },
  { href: "/clientes", label: "Novos vs. recorrentes" },
  {
    href: "/produtos",
    label: "Produtos",
    children: [
      // Mesma lógica do primeiro filho de Vendas: aponta para a rota do pai,
      // e existe para dar um alvo de VOLTA depois de ir aos SKUs.
      { href: "/produtos", label: "Top produtos + ABC" },
      { href: "/produtos/skus", label: "SKUs vendidos" },
    ],
  },
  { href: "/promocoes", label: "Promoções" },
  { href: "/cancelados", label: "Pedidos cancelados" },
];

/**
 * "Vendas" continua marcado nas três sub-rotas (`/vendas/pagamento` etc.). Sem
 * isso, entrar num recorte apagaria o item do menu e o usuário perderia a
 * referência de onde está — o nível de cima não deixa de valer porque o de
 * baixo mudou.
 */
function isInside(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  const href = (to: string) => (qs ? `${to}?${qs}` : to);

  return (
    // Abaixo de `lg` não há coluna lateral (ver layout.tsx): a lista deita e
    // vira uma faixa rolável no topo, que é o que cabe numa tela estreita.
    <nav
      aria-label="Relatórios"
      className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
    >
      {REPORTS.map((report) => {
        const open = isInside(pathname, report.href);
        // Um item COM filhos aberto é um contêiner, não a página atual — quem
        // está em azul é o filho. Se os dois ficassem em azul, o menu teria
        // dois "você está aqui" na mesma coluna.
        //
        // O fundo precisa ser mais escuro que o do hover (bg-surface-2):
        // do contrário o item ativo fica idêntico a "o mouse está em cima",
        // e as duas informações — onde estou / onde o ponteiro está — se
        // confundem.
        const openStyle = report.children
          ? "bg-border-strong/40 text-ink"
          : "bg-border-strong/40 text-primary";

        return (
          // `contents` na horizontal: numa tela estreita não há hierarquia
          // visual possível numa fita rolável, então pai e filhos viram irmãos
          // na mesma linha. A partir de `lg` o grupo volta a ser um bloco e a
          // sublista fica indentada sob o pai.
          <div key={report.href} className="contents lg:block">
            <Link
              href={href(report.href)}
              aria-current={open && !report.children ? "page" : undefined}
              // Com a seção aberta na horizontal, o pai é escondido: ele
              // apontaria para a mesma rota do primeiro filho, e dois alvos
              // idênticos lado a lado são ruído para quem navega por lista de
              // links. Na vertical o pai continua visível, porque ali ele é o
              // título da sublista indentada abaixo.
              className={`control shrink-0 rounded-md border px-3 text-sm font-medium transition-colors lg:flex lg:w-full ${
                open && report.children ? "hidden" : "inline-flex"
              } ${
                open
                  ? // Fundo + cor + peso, não só cor: o item ativo precisa
                    // sobreviver a quem não distingue o azul do cinza. A
                    // borda usa o mesmo tom neutro dos botões de filtro
                    // (border-border-subtle), para o botão ativo não virar
                    // uma mancha de cor sem contorno.
                    `${openStyle} border-border-subtle`
                  : "border-transparent text-ink-secondary hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {report.label}
              {report.children && <Chevron open={open} />}
            </Link>

            {report.children && open && (
              // `div` com `contents`, e não `ul`/`li`: `display: contents` faz
              // vários leitores de tela deixarem de anunciar a lista, então a
              // marcação de lista custaria semântica em vez de somar. O `nav`
              // acima já agrupa, e os links continuam sendo links.
              //
              // A régua vertical faz o papel da indentação: mostra onde a
              // sublista começa e onde termina sem depender de o usuário
              // comparar recuos de 12px entre linhas.
              <div className="contents lg:mt-1 lg:ml-3 lg:block lg:border-l lg:border-border-subtle lg:pl-2">
                {report.children.map((child) => {
                  const active = pathname === child.href;
                  return (
                    <Link
                      key={child.href}
                      href={href(child.href)}
                      aria-current={active ? "page" : undefined}
                      className={`control shrink-0 rounded-md px-3 text-sm transition-colors lg:flex lg:w-full ${
                        active
                          ? "font-medium text-primary"
                          : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Só decoração: o estado real (aberto/fechado) já está no fundo do item, no
 * peso do texto e na sublista visível logo abaixo. Por isso `aria-hidden` —
 * anunciar "seta" a mais não diz nada a quem já ouviu os três links seguintes.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`ml-auto hidden shrink-0 transition-transform lg:block ${
        open ? "rotate-90" : ""
      }`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

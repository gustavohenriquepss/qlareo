import { Logo } from "@/components/Logo";

/**
 * Placeholder até o painel do anunciante existir. Não é uma tela de produto:
 * só garante que o deploy de `app.qlareo.com` responde e leva quem caiu aqui
 * para a landing.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo className="h-8 w-auto text-ink" />
      <p className="max-w-sm text-ink-secondary">
        O painel do anunciante está chegando.
      </p>
      <a
        href="https://qlareo.com"
        className="control text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Conheça a Qlareo
      </a>
    </main>
  );
}

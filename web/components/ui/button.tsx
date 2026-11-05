import type { ComponentProps } from "react";

type Size = "sm" | "md" | "lg";
type Variant = "primary" | "secondary";

/*
  Mesma escala do botão da landing (`qlareo-LP/components/ui/button.tsx`):
  40 / 44 / 48px e canto de 16px. Quem chega pelo site não pode sentir que
  mudou de marca, e o anunciante abre o painel sobretudo no celular.

  - `lg` (48px): a ação principal de um formulário ou de uma tela.
  - `md` (44px): ações dentro de conteúdo.
  - `sm` (40px → 44px no toque): ações de cabeçalho.

  `primary` pinta com `--primary` (ação), não com `--brand` (identidade).
*/
const sizes: Record<Size, string> = {
  sm: "min-h-10 pointer-coarse:min-h-11 px-4 text-[14px] leading-5",
  md: "min-h-11 px-5 text-[15px] leading-5",
  lg: "min-h-12 px-7 text-[16px] leading-6",
};

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "bg-surface text-ink shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:bg-surface-2",
};

export function buttonClasses({
  size = "md",
  variant = "primary",
  className = "",
}: {
  size?: Size;
  variant?: Variant;
  className?: string;
} = {}) {
  return [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl font-semibold",
    "transition-[background-color,transform,box-shadow] duration-150 active:translate-y-px",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0",
    "focus-visible:outline-offset-3",
    variants[variant],
    sizes[size],
    className,
  ].join(" ");
}

export function Button({
  size,
  variant,
  className,
  ...props
}: ComponentProps<"button"> & { size?: Size; variant?: Variant }) {
  return <button {...props} className={buttonClasses({ size, variant, className })} />;
}

export function ButtonLink({
  size,
  variant,
  className,
  ...props
}: ComponentProps<"a"> & { size?: Size; variant?: Variant }) {
  return <a {...props} className={buttonClasses({ size, variant, className })} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/form-parts";
import { safeNext } from "@/lib/site";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Entrar · Qlareo" };

const NOTICES: Record<string, string> = {
  link: "Esse link expirou ou já foi usado. Entre com sua senha ou peça um link novo.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;

  return (
    <>
      <AuthHeading title="Entrar no painel" lead="Acompanhe as leituras dos seus QR codes e envie as artes das campanhas." />
      <SignInForm next={safeNext(next)} notice={erro ? NOTICES[erro] : undefined} />
      <div className="mt-6 flex flex-col gap-3 text-sm">
        <Link href="/recuperar-senha" className="control font-medium text-primary underline-offset-4 hover:underline">
          Esqueci minha senha
        </Link>
        <p className="text-ink-secondary">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/form-parts";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta · Qlareo" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Criar conta"
        lead="Depois do pagamento, ligamos sua campanha a esta conta e você acompanha tudo por aqui."
      />
      <SignUpForm />
      <p className="mt-6 text-sm text-ink-secondary">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}

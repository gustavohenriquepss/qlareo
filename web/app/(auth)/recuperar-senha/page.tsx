import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/form-parts";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Recuperar senha · Qlareo" };

export default function ResetRequestPage() {
  return (
    <>
      <AuthHeading title="Recuperar senha" lead="Informe o e-mail da conta. Enviamos um link para você criar uma senha nova." />
      <ResetRequestForm />
      <Link
        href="/entrar"
        className="control mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Voltar para entrar
      </Link>
    </>
  );
}

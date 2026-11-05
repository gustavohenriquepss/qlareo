import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/form-parts";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nova senha · Qlareo" };

/** Chega-se aqui pelo link de recuperação, que já abre uma sessão (ver /auth/confirmar). */
export default function NewPasswordPage() {
  return (
    <>
      <AuthHeading title="Criar senha nova" />
      <NewPasswordForm />
    </>
  );
}

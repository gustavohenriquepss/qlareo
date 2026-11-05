"use server";

import { redirect } from "next/navigation";
import { authErrorMessage } from "@/lib/auth/errors";
import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/** Estado devolvido aos formulários (`useActionState`). */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fields?: Record<string, string>;
      /** O que a pessoa digitou, para o formulário não voltar vazio. Nunca a senha. */
      values?: Record<string, string>;
    }
  | { status: "sent"; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function checkEmail(email: string) {
  return EMAIL_RE.test(email) ? null : "Informe um e-mail válido.";
}

/** Mesma regra do `supabase/config.toml` (8+, letras e números), conferida antes de ir ao servidor. */
function checkPassword(password: string) {
  if (password.length < 8) return "Use pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Misture letras e números.";
  }
  return null;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const password = formData.get("password");

  if (checkEmail(email) || typeof password !== "string" || !password) {
    return { status: "error", message: "Preencha e-mail e senha.", values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: authErrorMessage(error), values: { email } };

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const fullName = text(formData, "full_name");
  const company = text(formData, "company_name");
  const email = text(formData, "email");
  const password = formData.get("password");

  const fields: Record<string, string> = {};
  if (!fullName) fields.full_name = "Informe seu nome.";
  if (!company) fields.company_name = "Informe o nome da empresa.";
  const emailError = checkEmail(email);
  if (emailError) fields.email = emailError;
  const passwordError = typeof password === "string" ? checkPassword(password) : "Crie uma senha.";
  if (passwordError) fields.password = passwordError;

  const values = { full_name: fullName, company_name: company, email };

  if (Object.keys(fields).length > 0 || typeof password !== "string") {
    return { status: "error", message: "Confira os campos destacados.", fields, values };
  }

  const supabase = await createClient();
  // O trigger `private.handle_new_user` cria o anunciante com `company_name`.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_name: company } },
  });
  if (error) return { status: "error", message: authErrorMessage(error), values };

  // Com confirmação de e-mail ligada, um e-mail que já tem conta também chega
  // aqui sem erro. É a resposta certa: não contar quem tem conta.
  return { status: "sent", email };
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = text(formData, "email");
  const emailError = checkEmail(email);
  if (emailError) return { status: "error", message: emailError, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  // Limite de envio é o único erro que vale mostrar. Qualquer outro some
  // atrás da mesma resposta, exista a conta ou não.
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { status: "error", message: authErrorMessage(error), values: { email } };
  }

  return { status: "sent", email };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = formData.get("password");
  const confirm = formData.get("password_confirm");

  const passwordError = typeof password === "string" ? checkPassword(password) : "Crie uma senha.";
  if (passwordError || typeof password !== "string") {
    return { status: "error", message: "Confira a senha.", fields: { password: passwordError ?? "" } };
  }
  if (password !== confirm) {
    return {
      status: "error",
      message: "Confira a senha.",
      fields: { password_confirm: "As duas senhas não são iguais." },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", message: authErrorMessage(error) };

  redirect("/painel");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

import { redirect } from "next/navigation";

/** A raiz do app é o painel. Sem sessão, o proxy desvia para /entrar. */
export default function HomePage() {
  redirect("/painel");
}

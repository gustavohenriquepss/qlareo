/**
 * Erros do Supabase Auth em português, pelo `code` (estável), não pela
 * mensagem em inglês (que muda entre versões).
 *
 * Login com e-mail ou senha errados recebe uma mensagem só, de propósito:
 * dizer qual dos dois errou conta para um estranho quais e-mails têm conta.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha não conferem.",
  email_not_confirmed:
    "Falta confirmar seu e-mail. Abra o link que enviamos no cadastro.",
  weak_password:
    "Senha fraca. Use pelo menos 8 caracteres, com letras e números.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit:
    "Enviamos e-mails demais para este endereço. Espere alguns minutos e tente de novo.",
  over_request_rate_limit:
    "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  signup_disabled: "O cadastro está fechado no momento.",
  email_address_invalid: "Esse e-mail não parece válido.",
};

const FALLBACK = "Não deu certo agora. Tente de novo em instantes.";

export function authErrorMessage(error: { code?: string } | null | undefined) {
  return (error?.code && MESSAGES[error.code]) || FALLBACK;
}

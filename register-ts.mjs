/**
 * Registra o resolve hook antes de qualquer teste rodar.
 * Uso: `node --import ./register-ts.mjs --test`
 *
 * Nome NÃO começa com "test" de propósito: o runner nativo auto-descobre
 * arquivos que casam com `test-*` e tentaria executá-lo como suíte.
 */
import { register } from 'node:module'

register('./ts-resolve.mjs', import.meta.url)

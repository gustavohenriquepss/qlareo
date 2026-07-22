"use client";

/**
 * `prefers-reduced-motion` como valor de React.
 *
 * POR QUE ISTO EXISTE, se `globals.css` já tem um bloco
 * `@media (prefers-reduced-motion: reduce)`: aquele bloco zera
 * `animation-duration` e `transition-duration`, ou seja, só alcança animação
 * feita em CSS. O recharts 3.x anima a entrada dos gráficos em JavaScript, por
 * `requestAnimationFrame` — passa reto pela regra. Sem este hook, quem pediu
 * menos movimento no sistema continua vendo a linha ser desenhada e as barras
 * crescerem.
 *
 * `useSyncExternalStore` em vez de `useState` + `useEffect` por causa da
 * hidratação: `getServerSnapshot` é usado TAMBÉM no primeiro render do cliente,
 * então servidor e cliente concordam ("com movimento") e o valor real entra num
 * re-render logo em seguida. Com `useEffect` o risco seria ler a media query
 * antes da hidratação terminar e divergir do HTML do servidor.
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * No servidor não há media query. Assumir "com movimento" é o default seguro:
 * o cliente corrige em seguida, e o estado final de uma animação do recharts é
 * o mesmo gráfico — desligá-la só remove o caminho até ele.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

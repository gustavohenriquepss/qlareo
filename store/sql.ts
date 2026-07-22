/**
 * sql.ts — porta mínima de acesso a SQL.
 * -----------------------------------------------------------------------------
 * O restante do código depende DESTA interface, não do driver `pg`. Assim a
 * lógica do repositório Postgres é escrita e tipada contra um contrato pequeno,
 * e o único ponto que importa o `pg` de verdade (store/postgres/pgClient.ts)
 * fica isolado — trocável por outro driver, e fora do caminho de teste que roda
 * sem banco.
 *
 * `params` usa placeholders posicionais do Postgres ($1, $2, ...).
 * -----------------------------------------------------------------------------
 */
export interface SqlRow {
  [column: string]: unknown
}

export interface SqlResult<T extends SqlRow = SqlRow> {
  rows: T[]
  rowCount: number
}

export interface SqlClient {
  query<T extends SqlRow = SqlRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<SqlResult<T>>
}

/**
 * Executa uma função dentro de uma transação. A implementação Postgres real
 * abre um client dedicado do pool; a fake de teste pode só repassar.
 */
export interface Transactional {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>
}

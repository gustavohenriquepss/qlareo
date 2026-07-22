/**
 * pg.d.ts — declaração MÍNIMA do módulo 'pg'.
 * -----------------------------------------------------------------------------
 * `@types/pg` NÃO está instalado nesta máquina. Este arquivo declara só a parte
 * da superfície do driver que `pgClient.ts` usa, o suficiente para manter o
 * `tsc --noEmit` limpo sem o pacote de types.
 *
 * Em PRODUÇÃO, instale `@types/pg` (`npm i -D @types/pg`) — os tipos reais e
 * completos passam a valer e este stub deixa de ser necessário (pode ser
 * removido, ou fica inofensivo por causa de `skipLibCheck`).
 * -----------------------------------------------------------------------------
 */
declare module 'pg' {
  /** Resultado de uma query — o subconjunto que consumimos. */
  export interface QueryResult<R = any> {
    rows: R[]
    rowCount: number | null
  }

  /** Client dedicado, obtido do pool para uma transação. */
  export interface PoolClient {
    query<R = any>(
      text: string,
      params?: ReadonlyArray<unknown>
    ): Promise<QueryResult<R>>
    /** Devolve o client ao pool. */
    release(err?: Error): void
  }

  export interface PoolConfig {
    connectionString?: string
  }

  export class Pool {
    constructor(config?: PoolConfig)
    query<R = any>(
      text: string,
      params?: ReadonlyArray<unknown>
    ): Promise<QueryResult<R>>
    connect(): Promise<PoolClient>
    end(): Promise<void>
  }
}

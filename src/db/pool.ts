import pg from 'pg';

// PostgreSQL bigint (int8, type OID 20) is returned as a string by default to
// avoid precision loss. devflow's ids and GitHub issue/PR numbers always fit in
// a JS safe integer, so parse int8 as a number app-wide for ergonomic use.
pg.types.setTypeParser(20, (value: string) => Number(value));

const { Pool } = pg;

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

export type Pool = pg.Pool;

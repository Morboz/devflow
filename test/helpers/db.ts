import { createPool, type Pool } from '../../src/db/pool.js';
import { migrate } from '../../src/db/migrate.js';

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgres://devflow:devflow@localhost:5433/postgres';
const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://devflow:devflow@localhost:5433/devflow_test';
const TEST_DB_NAME = 'devflow_test';

let pool: Pool | undefined;

/** Ensure the test DB exists and is migrated. Call once per test run. */
export async function setupTestDb(): Promise<Pool> {
  const admin = createPool(ADMIN_URL);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`).catch((err: { code?: string }) => {
    // 42P04 = duplicate_database; anything else is a real error.
    if (err.code !== '42P04') throw err;
  });
  await admin.end();

  pool = createPool(TEST_URL);
  await migrate(pool);
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('setupTestDb() must run first');
  return pool;
}

/** Wipe all rows so each test starts clean (dependents truncated first). */
export async function resetTables(): Promise<void> {
  if (!pool) throw new Error('setupTestDb() must run first');
  await pool.query('TRUNCATE jobs, stage_runs, features RESTART IDENTITY CASCADE');
}

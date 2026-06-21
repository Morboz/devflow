import { createPool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL required');

const pool = createPool(databaseUrl);
try {
  await migrate(pool);
  console.log('migrations applied');
} finally {
  await pool.end();
}

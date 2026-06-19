import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { processOnce, type ClaimedJob } from '../worker/worker.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

// Phase 0 skeleton Stage: a no-op. Real Stage logic (Refinement/Decomposition/
// Implementation/Review) arrives Phase 1+. For now the worker proves the
// claim → execute → done loop works end-to-end.
const execute = async (job: ClaimedJob): Promise<void> => {
  console.debug(`[worker] skeleton execute for job #${job.jobId} (stage: ${job.stage})`);
};

console.log('devflow worker started');

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Reclaim-before-claim loop (ADR-0013/0018). processOnce handles one tick.
while (true) {
  try {
    const { ran } = await processOnce({
      pool,
      leaseSeconds: config.leaseSeconds,
      execute,
    });
    if (!ran) {
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  } catch (err) {
    console.error('[worker] tick failed:', err);
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

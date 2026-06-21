import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { enqueue } from '../src/queue/enqueue.js';
import {
  processOnce,
  reclaimExpiredLeases,
  type ClaimedJob,
} from '../src/worker/worker.js';
import { resetTables, setupTestDb } from './helpers/db.js';
import type { Trigger } from '../src/domain/types.js';

let pool: Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetTables();
});

const refineTrigger = (issueNumber: number, commentId: number): Trigger => ({
  stage: 'refinement',
  target: {
    kind: 'issue',
    number: issueNumber,
    repo: { owner: 'Morboz', name: 'devflow' },
  },
  triggerKey: `comment:${commentId}`,
});

const jobStatuses = async (): Promise<string[]> => {
  const res = await pool.query('SELECT status FROM jobs ORDER BY id');
  return res.rows.map((r: { status: string }) => r.status);
};

const runStatuses = async (): Promise<string[]> => {
  const res = await pool.query('SELECT status FROM stage_runs ORDER BY id');
  return res.rows.map((r: { status: string }) => r.status);
};

describe('worker', () => {
  it('claims a pending job, runs it, and marks it done (behavior #16)', async () => {
    await enqueue(pool, refineTrigger(42, 999));
    const execute = vi.fn<(job: ClaimedJob) => Promise<void>>();

    const result = await processOnce({ pool, leaseSeconds: 30, execute });

    expect(result.ran).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await jobStatuses()).toEqual(['done']);
    expect(await runStatuses()).toEqual(['done']);
  });

  it('reclaims a job whose lease expired as failed (behavior #17)', async () => {
    await enqueue(pool, refineTrigger(42, 999));
    // Simulate a claimed job whose lease has already expired (worker crash).
    await pool.query(`
      UPDATE jobs SET status = 'running',
        claimed_at = now() - interval '60 seconds',
        lease_expires_at = now() - interval '5 seconds'
      WHERE id = (SELECT min(id) FROM jobs)`);

    const reclaimed = await reclaimExpiredLeases(pool);

    expect(reclaimed).toBe(1);
    expect(await jobStatuses()).toEqual(['failed']);
    expect(await runStatuses()).toEqual(['failed']);
  });

  it('reclaims expired leases before claiming pending jobs in one tick (behavior #18)', async () => {
    // Job A: pending (will be claimed + executed).
    await enqueue(pool, refineTrigger(42, 999));
    // Job B: a second job, forced into a running + expired state.
    await enqueue(pool, refineTrigger(43, 998));
    await pool.query(`
      UPDATE jobs SET status = 'running',
        lease_expires_at = now() - interval '5 seconds'
      WHERE id = (SELECT max(id) FROM jobs)`);

    const execute = vi.fn<(job: ClaimedJob) => Promise<void>>();
    await processOnce({ pool, leaseSeconds: 30, execute });

    expect((await jobStatuses()).sort()).toEqual(['done', 'failed']);
    expect(execute).toHaveBeenCalledTimes(1); // only the pending one is claimed
  });

  it('is idle and error-free when there are no pending jobs (behavior #19)', async () => {
    const execute = vi.fn<(job: ClaimedJob) => Promise<void>>();

    const result = await processOnce({ pool, leaseSeconds: 30, execute });

    expect(result.ran).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});

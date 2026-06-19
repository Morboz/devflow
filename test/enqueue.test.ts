import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { enqueue } from '../src/queue/enqueue.js';
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

describe('enqueue', () => {
  it('creates a feature, a running stage_run, and a pending job (behavior #8)', async () => {
    const result = await enqueue(pool, refineTrigger(42, 999));
    expect(result.outcome).toBe('enqueued');
    if (result.outcome !== 'enqueued') throw new Error('unreachable');

    const feature = await pool.query('SELECT * FROM features WHERE id = $1', [
      result.featureId,
    ]);
    expect(feature.rows[0]).toMatchObject({
      repo_owner: 'Morboz',
      repo_name: 'devflow',
      source_issue_number: 42,
    });

    const stageRun = await pool.query('SELECT * FROM stage_runs WHERE id = $1', [
      result.stageRunId,
    ]);
    expect(stageRun.rows[0]).toMatchObject({
      feature_id: result.featureId,
      stage: 'refinement',
      status: 'running',
      trigger_key: 'comment:999',
    });

    const job = await pool.query('SELECT * FROM jobs WHERE id = $1', [
      result.jobId,
    ]);
    expect(job.rows[0]).toMatchObject({
      stage_run_id: result.stageRunId,
      status: 'pending',
    });
  });

  it('is idempotent for a duplicate trigger_key (behavior #9)', async () => {
    const first = await enqueue(pool, refineTrigger(42, 999));
    expect(first.outcome).toBe('enqueued');

    const second = await enqueue(pool, refineTrigger(42, 999));
    expect(second).toEqual({ outcome: 'duplicate' });

    const runs = await pool.query('SELECT count(*)::int AS n FROM stage_runs');
    expect(runs.rows[0]?.n).toBe(1);
  });

  it('rejects a second trigger for the same (feature, stage) while one is running (behavior #10)', async () => {
    const first = await enqueue(pool, refineTrigger(42, 999));
    expect(first.outcome).toBe('enqueued');

    // Different comment id (different trigger_key), same feature + stage.
    const second = await enqueue(pool, refineTrigger(42, 1000));
    expect(second).toEqual({ outcome: 'rejected', reason: 'stage_in_progress' });

    const runs = await pool.query('SELECT count(*)::int AS n FROM stage_runs');
    expect(runs.rows[0]?.n).toBe(1);
  });
});

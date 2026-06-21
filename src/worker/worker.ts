import type { Pool } from 'pg';

export type ClaimedJob = {
  jobId: number;
  stageRunId: number;
  stage: string;
  featureId: number;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
};

export type WorkerDeps = {
  pool: Pool;
  leaseSeconds: number;
  /** Skeleton Stage execution. Phase 0: a no-op. Throwing marks the job failed. */
  execute: (job: ClaimedJob) => Promise<void>;
};

/** Mark jobs whose lease has expired (worker crash) as failed (ADR-0018). */
export async function reclaimExpiredLeases(pool: Pool): Promise<number> {
  const expired = await pool.query(
    `UPDATE jobs
       SET status = 'failed', finished_at = now()
     WHERE status = 'running' AND lease_expires_at < now()
     RETURNING stage_run_id`,
  );
  for (const row of expired.rows) {
    await pool.query(
      `UPDATE stage_runs
         SET status = 'failed', updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [row.stage_run_id],
    );
  }
  return expired.rowCount ?? 0;
}

/** Claim the oldest pending job with FOR UPDATE SKIP LOCKED. Null when idle. */
async function claimNext(
  pool: Pool,
  leaseSeconds: number,
): Promise<ClaimedJob | null> {
  const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE jobs
         SET status = 'running', claimed_at = now(), lease_expires_at = $1
       WHERE id = (
         SELECT id FROM jobs WHERE status = 'pending'
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id, stage_run_id`,
      [leaseExpiresAt],
    );
    await client.query('COMMIT');

    const row = claimed.rows[0];
    if (!row) return null;

    const run = (
      await pool.query(
        `SELECT s.stage, s.feature_id, f.repo_owner, f.repo_name, f.source_issue_number
         FROM stage_runs s
         JOIN features f ON f.id = s.feature_id
         WHERE s.id = $1`,
        [row.stage_run_id],
      )
    ).rows[0];
    if (!run) throw new Error(`stage_run ${row.stage_run_id} not found`);

    return {
      jobId: row.id,
      stageRunId: row.stage_run_id,
      stage: run.stage,
      featureId: run.feature_id,
      repoOwner: run.repo_owner,
      repoName: run.repo_name,
      issueNumber: run.source_issue_number,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function markTerminal(
  pool: Pool,
  jobId: number,
  stageRunId: number,
  status: 'done' | 'failed',
): Promise<void> {
  await pool.query('UPDATE jobs SET status = $1, finished_at = now() WHERE id = $2', [
    status,
    jobId,
  ]);
  await pool.query(
    'UPDATE stage_runs SET status = $1, updated_at = now() WHERE id = $2',
    [status, stageRunId],
  );
}

/**
 * One worker tick: reclaim expired leases, then claim and run one pending job.
 * Reclaim-before-claim means no job stays stuck running across ticks.
 */
export async function processOnce(deps: WorkerDeps): Promise<{ ran: boolean }> {
  await reclaimExpiredLeases(deps.pool);
  const job = await claimNext(deps.pool, deps.leaseSeconds);
  if (!job) return { ran: false };

  try {
    await deps.execute(job);
    await markTerminal(deps.pool, job.jobId, job.stageRunId, 'done');
    return { ran: true };
  } catch (err) {
    await markTerminal(deps.pool, job.jobId, job.stageRunId, 'failed');
    throw err;
  }
}

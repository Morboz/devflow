import type { Pool, QueryResult } from 'pg';
import type { EnqueueResult, Trigger } from '../domain/types.js';

function idOf(res: QueryResult): number {
  const id = res.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('expected a row with numeric id');
  return id;
}

export async function enqueue(
  pool: Pool,
  trigger: Trigger,
): Promise<EnqueueResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find-or-create the Feature (ADR-0014): identity is ours; the GitHub
    // issue/PR number is a pointer.
    const feature = await client.query(
      `INSERT INTO features (repo_owner, repo_name, source_issue_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (repo_owner, repo_name, source_issue_number)
       DO UPDATE SET id = features.id
       RETURNING id`,
      [trigger.target.repo.owner, trigger.target.repo.name, trigger.target.number],
    );
    const featureId = idOf(feature);

    // A fresh trigger occupies the (feature, stage) slot immediately: the
    // stage_run is 'running' from the moment of trigger (Q5).
    const stageRun = await client.query(
      `INSERT INTO stage_runs (feature_id, stage, status, trigger_key)
       VALUES ($1, $2, 'running', $3)
       RETURNING id`,
      [featureId, trigger.stage, trigger.triggerKey],
    );
    const stageRunId = idOf(stageRun);

    const job = await client.query(
      `INSERT INTO jobs (stage_run_id, status) VALUES ($1, 'pending') RETURNING id`,
      [stageRunId],
    );
    const jobId = idOf(job);

    await client.query('COMMIT');
    return { outcome: 'enqueued', featureId, stageRunId, jobId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Rely on the schema constraints to decide the outcome (ADR-0010: the
    // schema is the hard constraint). Distinguish by constraint name.
    const constraint = (err as { constraint?: string }).constraint;
    if (constraint === 'stage_runs_trigger_key_uniq') {
      return { outcome: 'duplicate' };
    }
    if (constraint === 'stage_runs_exclusivity_uniq') {
      return { outcome: 'rejected', reason: 'stage_in_progress' };
    }
    throw err;
  } finally {
    client.release();
  }
}

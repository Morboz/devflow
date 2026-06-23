import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { handleEvent, HELP_TEXT, stageInProgressText } from '../src/webhook/handler.js';
import { resetTables, setupTestDb } from './helpers/db.js';
import type { CommentRef, WebhookEvent } from '../src/domain/types.js';

let pool: Pool;
const postComment = vi.fn<(ref: CommentRef, body: string) => Promise<void>>();

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetTables();
  postComment.mockClear();
});

const commentEvent = (
  body: string,
  opts: { issueNumber?: number; commentId?: number } = {},
): WebhookEvent => ({
  type: 'issue_comment',
  action: 'created',
  repo: { owner: 'Morboz', name: 'devflow' },
  issue: { number: opts.issueNumber ?? 42, isPullRequest: false },
  comment: { id: opts.commentId ?? 999, body },
});

describe('handleEvent', () => {
  it('posts a help reply inline for a bare @mbzdevflow mention (behavior #13)', async () => {
    await handleEvent(commentEvent('@mbzdevflow'), { pool, postComment });

    expect(postComment).toHaveBeenCalledTimes(1);
    expect(postComment).toHaveBeenCalledWith(
      { repo: { owner: 'Morboz', name: 'devflow' }, issueNumber: 42 },
      HELP_TEXT,
    );

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(0);
  });

  it('does nothing for a non-devflow comment (behavior #14)', async () => {
    await handleEvent(commentEvent('looks good to me'), { pool, postComment });

    expect(postComment).not.toHaveBeenCalled();
    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(0);
  });

  it('enqueues a job for @mbzdevflow /refine (behavior #11 core)', async () => {
    const res = await handleEvent(commentEvent('@mbzdevflow /refine'), {
      pool,
      postComment,
    });

    expect(res.status).toBe(200);
    expect(postComment).not.toHaveBeenCalled();

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it('does not enqueue a second job on a replayed webhook (same comment id) (S5 AC1)', async () => {
    // Same comment id => same trigger_key => idempotent dedup (ADR-0004/0016).
    const first = await handleEvent(
      commentEvent('@mbzdevflow /refine', { commentId: 999 }),
      { pool, postComment },
    );
    const replay = await handleEvent(
      commentEvent('@mbzdevflow /refine', { commentId: 999 }),
      { pool, postComment },
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    // A replay is a silent no-op: no comment, still exactly one job.
    expect(postComment).not.toHaveBeenCalled();

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it('rejects a second concurrent trigger and posts "Stage already in progress" inline (S5 AC2)', async () => {
    // First trigger occupies the (feature, refinement) slot as 'running'.
    await handleEvent(commentEvent('@mbzdevflow /refine', { commentId: 999 }), {
      pool,
      postComment,
    });

    // Second trigger: same issue + stage, different comment id (new trigger_key)
    // => blocked by Active Stage Run Exclusivity and replied to inline.
    const res = await handleEvent(
      commentEvent('@mbzdevflow /refine', { commentId: 1000 }),
      { pool, postComment },
    );

    expect(res.status).toBe(200); // 200: we processed the webhook; the rejection is a domain reply.
    expect(postComment).toHaveBeenCalledTimes(1);
    expect(postComment).toHaveBeenCalledWith(
      { repo: { owner: 'Morboz', name: 'devflow' }, issueNumber: 42 },
      stageInProgressText('refinement'),
    );

    // No second job was created for the rejected trigger.
    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(1);
  });
});

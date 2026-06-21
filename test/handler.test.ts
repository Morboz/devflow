import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { handleEvent, HELP_TEXT } from '../src/webhook/handler.js';
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

const commentEvent = (body: string, issueNumber = 42): WebhookEvent => ({
  type: 'issue_comment',
  action: 'created',
  repo: { owner: 'Morboz', name: 'devflow' },
  issue: { number: issueNumber, isPullRequest: false },
  comment: { id: 999, body },
});

describe('handleEvent', () => {
  it('posts a help reply inline for a bare @devflow mention (behavior #13)', async () => {
    await handleEvent(commentEvent('@devflow'), { pool, postComment });

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

  it('enqueues a job for @devflow /refine (behavior #11 core)', async () => {
    const res = await handleEvent(commentEvent('@devflow /refine'), {
      pool,
      postComment,
    });

    expect(res.status).toBe(200);
    expect(postComment).not.toHaveBeenCalled();

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(1);
  });
});

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Webhooks } from '@octokit/webhooks';
import type { Pool } from 'pg';
import { createWebhookServer } from '../src/webhook/server.js';
import { resetTables, setupTestDb } from './helpers/db.js';
import type { CommentRef } from '../src/domain/types.js';

const SECRET = 'test-webhook-secret';

let pool: Pool;
let server: http.Server;
let baseUrl: string;
const postComment = vi.fn<(ref: CommentRef, body: string) => Promise<void>>();

beforeAll(async () => {
  pool = await setupTestDb();
  server = createWebhookServer(SECRET, { pool, postComment });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await pool.end();
});

beforeEach(async () => {
  await resetTables();
  postComment.mockClear();
});

async function sign(body: string, secret = SECRET): Promise<string> {
  return new Webhooks({ secret }).sign(body);
}

async function postRaw(event: string, rawBody: string, signature: string) {
  return fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-github-delivery': '11111111-2222-3333-4444-555555555555',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  });
}

const issueCommentPayload = {
  action: 'created',
  repository: { owner: { login: 'Morboz' }, name: 'devflow' },
  issue: { number: 42 },
  comment: { id: 999, body: '@mbzdevflow /refine' },
};

describe('webhook endpoint', () => {
  it('accepts a signed /refine comment and enqueues a job (behavior #11)', async () => {
    const body = JSON.stringify(issueCommentPayload);
    const res = await postRaw('issue_comment', body, await sign(body));

    expect(res.status).toBe(200);

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it('rejects a wrong signature with 401 and enqueues nothing (behavior #12)', async () => {
    const body = JSON.stringify(issueCommentPayload);
    const wrongSig = await sign(body + 'tampered');

    const res = await postRaw('issue_comment', body, wrongSig);

    expect(res.status).toBe(401);

    const jobs = await pool.query('SELECT count(*)::int AS n FROM jobs');
    expect(jobs.rows[0]?.n).toBe(0);
  });
});

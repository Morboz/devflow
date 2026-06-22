import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Pool } from 'pg';
import { claudeRunner, SKELETON_PROMPT } from '../src/execution/claude.js';
import type { RepoGitHub } from '../src/github/client.js';
import { handleEvent } from '../src/webhook/handler.js';
import { executeStage } from '../src/worker/stage.js';
import { processOnce, type ClaimedJob } from '../src/worker/worker.js';
import { resetTables, setupTestDb } from './helpers/db.js';
import type { CommentRef, WebhookEvent } from '../src/domain/types.js';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
// Stand-in for the `claude` binary (ADR-0020): accepts `-p <prompt>`, echoes a
// sandbox-referencing response, and dumps the provider env / exits non-zero on
// request. Lets the D8 wiring run end-to-end with no real model or API key.
const FAKE_CLAUDE = join(here, 'fixtures', 'fake-claude.sh');

let pool: Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await pool.end();
});

/** Minimal GitHub double that records progress-comment creates/edits. */
class FakeGitHub implements RepoGitHub {
  created: string[] = [];
  updates: string[] = [];
  async createIssueComment(_o: string, _r: string, _n: number, body: string) {
    this.created.push(body);
    return this.created.length;
  }
  async updateIssueComment(_o: string, _r: string, _id: number, body: string) {
    this.updates.push(body);
  }
  async listBranches() {
    return [];
  }
  async countPullRequestsForBranch() {
    return 0;
  }
  async deleteBranch() {
    /* noop */
  }
  async getBranchCommitDate() {
    return '';
  }
}

/** Build a local bare-ish source repo the sandbox can shallow-clone (no token). */
async function makeSourceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-smoke-src-'));
  await exec('git', ['init', '-q'], { cwd: dir });
  await exec('git', ['config', 'user.email', 'test@devflow'], { cwd: dir });
  await exec('git', ['config', 'user.name', 'test'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# hi\n');
  await exec('git', ['add', '.'], { cwd: dir });
  await exec('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

const refineEvent: WebhookEvent = {
  type: 'issue_comment',
  action: 'created',
  repo: { owner: 'Morboz', name: 'devflow' },
  issue: { number: 42, isPullRequest: false },
  comment: { id: 999, body: '@mbzdevflow /refine' },
};

describe('D8 end-to-end smoke (webhook → enqueue → worker → sandbox → Claude headless → done)', () => {
  let baseDir: string;
  let source: string;

  beforeEach(async () => {
    await resetTables();
    baseDir = await mkdtemp(join(tmpdir(), 'devflow-smoke-'));
    source = await makeSourceRepo();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  const statuses = async (table: 'jobs' | 'stage_runs'): Promise<string[]> => {
    const res = await pool.query(`SELECT status FROM ${table} ORDER BY id`);
    return res.rows.map((r: { status: string }) => r.status);
  };

  it('runs a job to done; Claude output references the sandbox; provider config reaches the subprocess; sandbox cleaned up (criteria 1, 2, 4)', async () => {
    const gh = new FakeGitHub();
    const envFile = join(baseDir, 'fake-claude.env');

    // handleEvent is the post-signature-verify dispatch the webhook server runs
    // (signature/parse coverage lives in webhook.test.ts). This enqueues a real
    // job row — the start of the chain.
    const result = await handleEvent(refineEvent, {
      pool,
      postComment: vi.fn<(ref: CommentRef, body: string) => Promise<void>>(),
      botSlug: 'mbzdevflow',
    });
    expect(result.status).toBe(200);

    const execute = (job: ClaimedJob) =>
      executeStage(job, {
        getToken: async () => 'tok',
        ghFactory: () => gh,
        cloneUrl: source,
        sandboxBaseDir: baseDir,
        runClaude: claudeRunner({
          prompt: SKELETON_PROMPT,
          providerModel: 'test-model',
          providerApiKey: 'test-key',
          providerBaseUrl: 'https://example.test/anthropic',
          command: FAKE_CLAUDE,
          baseEnv: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            FAKE_CLAUDE_ENV_FILE: envFile,
          },
        }),
      });

    const { ran } = await processOnce({ pool, leaseSeconds: 30, execute });
    expect(ran).toBe(true);

    // Job + stage_run both terminal-done.
    expect(await statuses('jobs')).toEqual(['done']);
    expect(await statuses('stage_runs')).toEqual(['done']);

    // Progress comment's terminal line carries the (fake) Claude output, which
    // references the sandbox contents — criterion 1.
    const terminal = gh.updates.at(-1);
    expect(terminal).toBeDefined();
    expect(terminal).toContain('✅ done');
    expect(terminal).toContain('Files in this repository');

    // Provider config reached the subprocess env (read from config, not
    // hardcoded) and cwd was the sandbox — criterion 2. Resolve the base dir:
    // on macOS `/tmp`→`/private/tmp` is a symlink, and the child's $PWD is the
    // real path, so compare against realpath(baseDir).
    const envDump = await readFile(envFile, 'utf8');
    const sandboxPwd = join(await realpath(baseDir), '1');
    expect(envDump).toContain('ANTHROPIC_API_KEY=test-key');
    expect(envDump).toContain('ANTHROPIC_MODEL=test-model');
    expect(envDump).toContain('ANTHROPIC_BASE_URL=https://example.test/anthropic');
    expect(envDump).toContain(`PWD=${sandboxPwd}`);

    // Sandbox cleaned up on success.
    await expect(access(join(baseDir, '1'))).rejects.toThrow();
  });

  it('surfaces a non-zero Claude exit as a Job failure (not a crash) and still cleans up — criterion 3', async () => {
    const gh = new FakeGitHub();
    await handleEvent(refineEvent, {
      pool,
      postComment: vi.fn<(ref: CommentRef, body: string) => Promise<void>>(),
      botSlug: 'mbzdevflow',
    });

    const execute = (job: ClaimedJob) =>
      executeStage(job, {
        getToken: async () => 'tok',
        ghFactory: () => gh,
        cloneUrl: source,
        sandboxBaseDir: baseDir,
        runClaude: claudeRunner({
          prompt: SKELETON_PROMPT,
          providerModel: 'test-model',
          providerApiKey: 'test-key',
          command: FAKE_CLAUDE,
          baseEnv: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            FAKE_CLAUDE_EXIT: '2',
          },
        }),
      });

    // processOnce marks the job failed, then re-throws — the error is contained
    // (caught + surfaced as a Job failure), not an uncaught crash.
    await expect(processOnce({ pool, leaseSeconds: 30, execute })).rejects.toThrow();

    expect(await statuses('jobs')).toEqual(['failed']);
    expect(await statuses('stage_runs')).toEqual(['failed']);
    expect(gh.updates.at(-1)).toContain('❌ failed');
    await expect(access(join(baseDir, '1'))).rejects.toThrow(); // cleaned up even on failure
  });
});

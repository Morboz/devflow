import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeStage } from '../src/worker/stage.js';
import type { ClaimedJob } from '../src/worker/worker.js';
import type { RepoGitHub } from '../src/github/client.js';

const exec = promisify(execFile);

async function makeSourceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-src-'));
  await exec('git', ['init', '-q'], { cwd: dir });
  await exec('git', ['config', 'user.email', 'test@devflow'], { cwd: dir });
  await exec('git', ['config', 'user.name', 'test'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# hi\n');
  await exec('git', ['add', '.'], { cwd: dir });
  await exec('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

class FakeGitHub implements RepoGitHub {
  created: { body: string }[] = [];
  updates: { body: string }[] = [];
  async createIssueComment(_o: string, _r: string, _n: number, body: string) {
    this.created.push({ body });
    return this.created.length;
  }
  async updateIssueComment(_o: string, _r: string, _id: number, body: string) {
    this.updates.push({ body });
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

describe('executeStage (orchestration)', () => {
  let baseDir: string;
  let source: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'devflow-stage-'));
    source = await makeSourceRepo();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  const job: ClaimedJob = {
    jobId: 1,
    stageRunId: 1,
    stage: 'refinement',
    featureId: 1,
    repoOwner: 'Morboz',
    repoName: 'devflow',
    issueNumber: 42,
  };

  it('occupies a comment, clones, runs Claude in the sandbox, posts done, cleans up', async () => {
    const gh = new FakeGitHub();
    const claude = vi
      .fn<(cwd: string) => Promise<{ stdout: string }>>()
      .mockResolvedValue({ stdout: 'listed 3 files' });

    await executeStage(job, {
      getToken: async () => 'tok',
      ghFactory: () => gh,
      cloneUrl: source,
      runClaude: claude,
      sandboxBaseDir: baseDir,
    });

    expect(gh.created).toHaveLength(1);
    expect(gh.created[0]!.body).toContain('🤖 `refinement` started');

    expect(claude).toHaveBeenCalledTimes(1);
    expect(claude.mock.calls[0]![0]).toBe(join(baseDir, '1')); // ran inside the sandbox

    expect(gh.updates.at(-1)!.body).toContain('✅ done');

    await expect(access(join(baseDir, '1'))).rejects.toThrow(); // sandbox cleaned up
  });

  it('posts the failure line, re-throws, and still cleans up when Claude fails', async () => {
    const gh = new FakeGitHub();
    const claude = vi
      .fn<(cwd: string) => Promise<{ stdout: string }>>()
      .mockRejectedValue(new Error('boom'));

    await expect(
      executeStage(job, {
        getToken: async () => 'tok',
        ghFactory: () => gh,
        cloneUrl: source,
        runClaude: claude,
        sandboxBaseDir: baseDir,
      }),
    ).rejects.toThrow('boom');

    expect(gh.updates.at(-1)!.body).toContain('❌ failed: boom');
    await expect(access(join(baseDir, '1'))).rejects.toThrow();
  });
});

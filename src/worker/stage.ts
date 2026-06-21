import type { RepoGitHub } from '../github/client.js';
import { createSandbox, removeSandbox } from './sandbox.js';
import { ProgressComment } from './progress-comment.js';
import type { ClaimedJob } from './worker.js';

export type StageDeps = {
  /** Mint a fresh installation token for this Job (D7). */
  getToken: () => Promise<string>;
  /** Build a GitHub client authenticated with that token (per-Job isolation). */
  ghFactory: (token: string) => RepoGitHub;
  /** Base clone URL for the repo (https://github.com/owner/repo). */
  cloneUrl: string;
  /** Run Claude Code headless in the sandbox cwd (D8). */
  runClaude: (cwd: string) => Promise<{ stdout: string }>;
  sandboxBaseDir?: string;
};

function truncate(s: string, n = 160): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Phase-0 skeleton Stage execution: occupy a progress comment → create a
 * sandbox clone using the installation token → run Claude headless with a
 * trivial prompt → terminal progress line → cleanup. Any failure posts the ❌
 * line first, then re-throws so the worker marks the Job failed (the sandbox is
 * always cleaned up).
 */
export async function executeStage(job: ClaimedJob, deps: StageDeps): Promise<void> {
  const token = await deps.getToken();
  const gh = deps.ghFactory(token);
  const progress = new ProgressComment(gh, {
    owner: job.repoOwner,
    repo: job.repoName,
    issueNumber: job.issueNumber,
  });

  await progress.occupy(job.stage);
  const sandbox = await createSandbox(job.jobId, {
    cloneUrl: deps.cloneUrl,
    token,
    baseDir: deps.sandboxBaseDir,
  });

  try {
    await progress.milestone('running Execution Engine');
    const { stdout } = await deps.runClaude(sandbox.path);
    await progress.done(`skeleton output: ${truncate(stdout.trim())}`);
  } catch (err) {
    await progress.failed(err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    await removeSandbox(sandbox);
  }
}

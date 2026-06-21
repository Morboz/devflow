import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type Sandbox = { path: string };

export const DEFAULT_SANDBOX_BASE = '/tmp/devflow-jobs';

/**
 * Embed an installation token in an HTTPS clone URL (x-access-token form),
 * as git expects. Pure — unit-tested separately from the clone.
 */
export function withToken(cloneUrl: string, token: string): string {
  return cloneUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

/**
 * Create an isolated, ephemeral sandbox for a Job: a shallow clone
 * (--depth=50) of the target repo under <baseDir>/<jobId> (ADR-0006).
 * Clone uses the installation token, not a persisted PAT.
 */
export async function createSandbox(
  jobId: number,
  opts: { cloneUrl: string; token?: string; baseDir?: string; depth?: number },
): Promise<Sandbox> {
  const baseDir = opts.baseDir ?? DEFAULT_SANDBOX_BASE;
  const depth = opts.depth ?? 50;
  const path = join(baseDir, String(jobId));

  await mkdir(baseDir, { recursive: true });
  const url = opts.token ? withToken(opts.cloneUrl, opts.token) : opts.cloneUrl;
  await execFileP('git', ['clone', '--depth', String(depth), url, path]);

  return { path };
}

/** Delete the sandbox directory (success or failure). */
export async function removeSandbox(sandbox: Sandbox): Promise<void> {
  await rm(sandbox.path, { recursive: true, force: true });
}

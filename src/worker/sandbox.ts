import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type Sandbox = { path: string };

export const DEFAULT_SANDBOX_BASE = '/tmp/devflow-jobs';

/**
 * Build the HTTP Authorization header for an installation token, in the form
 * git's `http.extraHeader` expects (D6). Used instead of embedding the token
 * in the clone URL: `git clone https://x-access-token:TOKEN@host/...` persists
 * the token into the sandbox's `.git/config` (remote.origin.url), which
 * violates "token not written to disk" (ADR-0008 / issue #4) — and if sandbox
 * cleanup is skipped (e.g. SIGKILL), the token would survive on disk until it
 * expires. Passing auth as a one-shot `-c http.extraHeader` keeps the token in
 * process memory only; the cloned `.git/config` holds a clean, tokenless URL.
 */
export function cloneAuthHeader(token: string): string {
  const cred = Buffer.from(`x-access-token:${token}`).toString('base64');
  return `Authorization: Basic ${cred}`;
}

/**
 * Create an isolated, ephemeral sandbox for a Job: a shallow clone
 * (--depth=50) of the target repo under <baseDir>/<jobId> (ADR-0006).
 * Clone authenticates with the installation token via a one-shot http header,
 * not a persisted PAT and not a token-bearing URL.
 */
export async function createSandbox(
  jobId: number,
  opts: { cloneUrl: string; token?: string; baseDir?: string; depth?: number },
): Promise<Sandbox> {
  const baseDir = opts.baseDir ?? DEFAULT_SANDBOX_BASE;
  const depth = opts.depth ?? 50;
  const path = join(baseDir, String(jobId));

  await mkdir(baseDir, { recursive: true });

  // `-c` must precede `clone`. The extraHeader is a runtime-only config value
  // (git does not write `-c` settings to .git/config), so the token never lands
  // on disk. A `file://`/local-path clone ignores http.* config, so passing the
  // header there is harmless.
  const args = ['clone', '--depth', String(depth), opts.cloneUrl, path];
  if (opts.token) {
    args.unshift('-c', `http.extraHeader=${cloneAuthHeader(opts.token)}`);
  }
  await execFileP('git', args);

  return { path };
}

/** Delete the sandbox directory (success or failure). */
export async function removeSandbox(sandbox: Sandbox): Promise<void> {
  await rm(sandbox.path, { recursive: true, force: true });
}

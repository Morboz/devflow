import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloneAuthHeader, createSandbox, pushBranch, removeSandbox } from '../src/worker/sandbox.js';

const exec = promisify(execFile);

async function makeSourceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-src-'));
  await exec('git', ['init', '-q'], { cwd: dir });
  await exec('git', ['config', 'user.email', 'test@devflow'], { cwd: dir });
  await exec('git', ['config', 'user.name', 'test'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# hello\n');
  await exec('git', ['add', '.'], { cwd: dir });
  await exec('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

/**
 * A bare remote accepts pushes to any branch (no working-tree "current branch"
 * conflict), so writable-mode push can land a devflow/* branch without a real
 * GitHub round-trip. Seeded by mirroring a one-commit working repo.
 */
async function makeBareRemote(): Promise<string> {
  const seed = await makeSourceRepo();
  const bare = await mkdtemp(join(tmpdir(), 'devflow-remote-'));
  await exec('git', ['clone', '-q', '--bare', seed, bare]);
  await rm(seed, { recursive: true, force: true });
  return bare;
}

describe('sandbox', () => {
  let baseDir: string;
  let source: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'devflow-jobs-'));
    source = await makeSourceRepo();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it('shallow-clones the repo into <baseDir>/<jobId> and exposes its files (D6)', async () => {
    const sb = await createSandbox(123, { cloneUrl: source, baseDir, depth: 1 });

    expect(sb.path).toBe(join(baseDir, '123'));
    const content = await readFile(join(sb.path, 'README.md'), 'utf8');
    expect(content).toContain('# hello');
  });

  it('removes the sandbox directory on cleanup (D6)', async () => {
    const sb = await createSandbox(456, { cloneUrl: source, baseDir, depth: 1 });
    await removeSandbox(sb);

    await expect(access(sb.path)).rejects.toThrow();
  });

  it('builds a Basic auth http.extraHeader carrying the token (pure)', () => {
    const header = cloneAuthHeader('tok_123');
    expect(header.startsWith('Authorization: Basic ')).toBe(true);
    // The credential is base64('x-access-token:<token>'): assert it round-trips
    // back to the x-access-token form rather than pinning a base64 literal.
    const cred = header.slice('Authorization: Basic '.length);
    expect(Buffer.from(cred, 'base64').toString('utf8')).toBe(
      'x-access-token:tok_123',
    );
  });

  it('does not write the installation token into the sandbox .git/config (D7/issue #4)', async () => {
    const token = 'secret_install_token_value';
    const sb = await createSandbox(789, {
      cloneUrl: source,
      baseDir,
      depth: 1,
      token,
    });

    const config = await readFile(join(sb.path, '.git', 'config'), 'utf8');
    // The clean URL is recorded; the token must never appear on disk.
    expect(config).not.toContain(token);
    expect(config).not.toContain('x-access-token');
  });

  it('gives two concurrent Jobs independent directories (criterion #4)', async () => {
    const a = await createSandbox(1, { cloneUrl: source, baseDir, depth: 1 });
    const b = await createSandbox(2, { cloneUrl: source, baseDir, depth: 1 });

    expect(a.path).toBe(join(baseDir, '1'));
    expect(b.path).toBe(join(baseDir, '2'));
    expect(a.path).not.toBe(b.path);

    // A file written in one Job's sandbox is invisible to the other.
    await writeFile(join(a.path, 'A.marker'), 'a');
    await writeFile(join(b.path, 'B.marker'), 'b');
    await expect(access(join(a.path, 'B.marker'))).rejects.toThrow();
    await expect(access(join(b.path, 'A.marker'))).rejects.toThrow();
  });

  it('defaults to read-only mode and refuses to push (criterion #6)', async () => {
    const sb = await createSandbox(101, { cloneUrl: source, baseDir, depth: 1 });
    expect(sb.mode).toBe('readonly');

    await expect(pushBranch(sb, { token: 'tok', branch: 'devflow/x' })).rejects.toThrow(
      /writable/,
    );
  });

  it('writable mode pushes a devflow/* branch and keeps the token off disk (criterion #6)', async () => {
    const remote = await makeBareRemote();
    try {
      const sb = await createSandbox(202, {
        cloneUrl: remote,
        baseDir,
        depth: 1,
        mode: 'writable',
      });
      expect(sb.mode).toBe('writable');

      // Commit on top of the cloned HEAD, then push it as a devflow/* branch.
      await exec('git', ['config', 'user.email', 'test@devflow'], { cwd: sb.path });
      await exec('git', ['config', 'user.name', 'test'], { cwd: sb.path });
      await writeFile(join(sb.path, 'CHANGE.md'), 'change\n');
      await exec('git', ['add', '.'], { cwd: sb.path });
      await exec('git', ['commit', '-q', '-m', 'change'], { cwd: sb.path });

      const token = 'tok_push_secret';
      await pushBranch(sb, { token, branch: 'devflow/test-push' });

      // The branch is now present in the bare remote.
      const branches = (await exec('git', ['-C', remote, 'branch'])).stdout;
      expect(branches).toContain('devflow/test-push');

      // The push re-supplied auth as a one-shot header; the token is still
      // nowhere in the sandbox's .git/config.
      const config = await readFile(join(sb.path, '.git', 'config'), 'utf8');
      expect(config).not.toContain(token);
      expect(config).not.toContain('x-access-token');
    } finally {
      await rm(remote, { recursive: true, force: true });
    }
  });

  it('pushBranch refuses a non-devflow/* ref (ADR-0006: never push main)', async () => {
    const remote = await makeBareRemote();
    try {
      const sb = await createSandbox(303, {
        cloneUrl: remote,
        baseDir,
        depth: 1,
        mode: 'writable',
      });
      await expect(
        pushBranch(sb, { token: 'tok', branch: 'main' }),
      ).rejects.toThrow(/devflow\/\*/);
    } finally {
      await rm(remote, { recursive: true, force: true });
    }
  });
});

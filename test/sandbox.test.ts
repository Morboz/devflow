import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloneAuthHeader, createSandbox, removeSandbox } from '../src/worker/sandbox.js';

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
});

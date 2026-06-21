import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandbox, removeSandbox, withToken } from '../src/worker/sandbox.js';

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

  it('embeds the installation token in an HTTPS clone URL (pure)', () => {
    expect(withToken('https://github.com/Morboz/devflow', 'tok_123')).toBe(
      'https://x-access-token:tok_123@github.com/Morboz/devflow',
    );
  });
});

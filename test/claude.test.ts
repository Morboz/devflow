import { describe, expect, it } from 'vitest';
import {
  claudeArgs,
  ExecutionError,
  runCommand,
} from '../src/execution/claude.js';

describe('execution', () => {
  it('captures stdout on success', async () => {
    const r = await runCommand({
      command: 'node',
      args: ['-e', 'process.stdout.write("hi")'],
      cwd: process.cwd(),
    });
    expect(r.stdout).toBe('hi');
  });

  it('surfaces a non-zero exit as ExecutionError with the exit code (D8)', async () => {
    await expect(
      runCommand({
        command: 'node',
        args: ['-e', 'process.exit(2)'],
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({ exitCode: 2, timedOut: false });

    await expect(
      runCommand({
        command: 'node',
        args: ['-e', 'process.exit(2)'],
        cwd: process.cwd(),
      }),
    ).rejects.toBeInstanceOf(ExecutionError);
  });

  it('surfaces a timeout as ExecutionError with timedOut=true (D8)', async () => {
    await expect(
      runCommand({
        command: 'sleep',
        args: ['10'],
        cwd: process.cwd(),
        timeoutMs: 150,
      }),
    ).rejects.toMatchObject({ timedOut: true });
  });

  it('claudeArgs builds the headless invocation (pure)', () => {
    expect(claudeArgs('list files in this repo')).toEqual([
      '-p',
      'list files in this repo',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  claudeArgs,
  claudeEnv,
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

describe('claudeEnv (provider config → subprocess env, D8 criterion 2)', () => {
  // Pure tests pass an explicit base so they never depend on the host env (a
  // developer's shell may export ANTHROPIC_* for a local Claude proxy).

  it('puts the model and key on ANTHROPIC_MODEL / ANTHROPIC_API_KEY', () => {
    const env = claudeEnv(
      { providerModel: 'glm-4.6', providerApiKey: 'sk-test' },
      {},
    );
    expect(env.ANTHROPIC_MODEL).toBe('glm-4.6');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it('adds ANTHROPIC_BASE_URL only when a providerBaseUrl is configured', () => {
    const env = claudeEnv(
      {
        providerModel: 'm',
        providerApiKey: 'k',
        providerBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
      },
      {},
    );
    expect(env.ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic');
  });

  it('merges over a base env; provider config wins over any stale value', () => {
    const env = claudeEnv(
      { providerModel: 'm', providerApiKey: 'fresh' },
      { PATH: '/usr/bin', HOME: '/h', ANTHROPIC_API_KEY: 'stale' },
    );
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/h');
    expect(env.ANTHROPIC_API_KEY).toBe('fresh');
  });
});

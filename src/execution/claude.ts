import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** A failure surfaced from running a command (non-zero exit or timeout). */
export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly timedOut: boolean,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * Run a command in a directory, capturing stdout. Non-zero exit or timeout
 * throws {@link ExecutionError} (so the caller — the worker — surfaces it as a
 * Job failure instead of crashing). Generic so the mechanics are testable with
 * any command; {@link runClaudeHeadless} wraps it for Claude Code.
 */
export async function runCommand(opts: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}): Promise<{ stdout: string }> {
  try {
    const { stdout } = await execFileP(opts.command, opts.args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 60_000,
      maxBuffer: opts.maxBuffer ?? 10 * 1024 * 1024,
      env: opts.env,
    });
    return { stdout };
  } catch (err) {
    const e = err as {
      code?: number | string;
      signal?: string;
      stderr?: string;
      message?: string;
    };
    throw new ExecutionError(
      e.message ?? 'command failed',
      typeof e.code === 'number' ? e.code : null,
      e.signal === 'SIGTERM',
      e.stderr ?? '',
    );
  }
}

/** Headless Claude Code invocation args: `claude -p "<prompt>"`. */
export function claudeArgs(prompt: string): string[] {
  return ['-p', prompt];
}

/**
 * Invoke Claude Code headless inside a sandbox (D8, skeleton-grade). Runs
 * `claude -p <prompt>` with the sandbox as cwd and the provider key on the
 * environment; returns captured stdout. Failures (non-zero exit, timeout)
 * throw {@link ExecutionError} → the worker marks the Job failed (D8
 * acceptance). `command` is injectable so the real binary isn't required to
 * test wiring.
 */
export async function runClaudeHeadless(opts: {
  cwd: string;
  prompt: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  command?: string;
}): Promise<{ stdout: string }> {
  return runCommand({
    command: opts.command ?? 'claude',
    args: claudeArgs(opts.prompt),
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: opts.env,
  });
}

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

/**
 * Phase-0 skeleton prompt (D8): trivial, and it references the sandbox (the
 * cloned repo) so the end-to-end smoke test can assert the captured output is
 * about the sandbox contents — not Stage prompt engineering (that is Phase 1+).
 */
export const SKELETON_PROMPT = 'List the files in this repository.';

/** Provider Config held directly, no abstraction layer (ADR-0009). */
export type ProviderConfig = {
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl?: string;
};

/**
 * Build the env for a headless Claude Code subprocess from the Provider Config
 * (ADR-0009 / issue #6 criterion 2 — model and key read from config, not
 * hardcoded). Claude Code reads all three from its environment, so the headless
 * invocation needs no flags beyond `-p <prompt>`:
 * - `ANTHROPIC_API_KEY` — auth;
 * - `ANTHROPIC_MODEL` — which model to run;
 * - `ANTHROPIC_BASE_URL` — a non-official Anthropic-compatible endpoint (e.g.
 *   Zhipu BigModel); omitted for the official API.
 */
export function claudeEnv(
  provider: ProviderConfig,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    ANTHROPIC_API_KEY: provider.providerApiKey,
    ANTHROPIC_MODEL: provider.providerModel,
    ...(provider.providerBaseUrl
      ? { ANTHROPIC_BASE_URL: provider.providerBaseUrl }
      : {}),
  };
}

/**
 * Build the `runClaude` dependency {@link executeStage} expects: a closure that
 * invokes Claude Code headless in a sandbox cwd with the Provider Config on the
 * env. Centralizes the provider-config → env → subprocess wiring (previously
 * inlined in the CLI entrypoint) so the worker and the end-to-end smoke test
 * share one path. `command`/`baseEnv` are injectable so the wiring is testable
 * without the real `claude` binary or an API key (ADR-0020).
 */
export function claudeRunner(
  opts: ProviderConfig & {
    prompt: string;
    timeoutMs?: number;
    command?: string;
    baseEnv?: NodeJS.ProcessEnv;
  },
): (cwd: string) => Promise<{ stdout: string }> {
  return (cwd) =>
    runClaudeHeadless({
      cwd,
      prompt: opts.prompt,
      timeoutMs: opts.timeoutMs,
      command: opts.command,
      env: claudeEnv(opts, opts.baseEnv),
    });
}

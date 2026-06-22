#!/bin/sh
# Stand-in for the `claude` binary in D8 skeleton tests (ADR-0020). Accepts the
# same headless shape Claude Code uses — `<self> -p <prompt>` — and emulates a
# trivial response that references the sandbox (its cwd), so the end-to-end
# smoke test can assert captured output is about the sandbox contents (issue #6
# criterion 1) WITHOUT a real model, API key, or network.
#
# Honor a few knobs via the environment (set by the test through baseEnv):
#   FAKE_CLAUDE_ENV_FILE  if set, write the received provider env here — lets
#                         the test assert provider config reached the subprocess
#                         and that cwd was the sandbox (criterion 2).
#   FAKE_CLAUDE_EXIT      if set, exit with this code — exercises the non-zero
#                         failure path (criterion 3).
shift  # drop "-p"; the prompt itself is irrelevant to the skeleton response.

if [ -n "${FAKE_CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
    echo "ANTHROPIC_MODEL=${ANTHROPIC_MODEL}"
    echo "ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL}"
    echo "PWD=${PWD}"
  } > "$FAKE_CLAUDE_ENV_FILE"
fi

if [ -n "${FAKE_CLAUDE_EXIT:-}" ]; then
  exit "$FAKE_CLAUDE_EXIT"
fi

# Trivial skeleton response: list the repository (sandbox cwd) contents.
echo "Files in this repository:"
ls -A

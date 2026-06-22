#!/usr/bin/env bash
# Run on the server — over SSH from the deploy workflow, or manually
# (`cd ~/devflow && git pull && bash scripts/deploy.sh`). The workflow syncs
# the repo first, so a push that changes THIS file executes the new version on
# the same run (not one deploy later).
#
# Renders .env from values forwarded by the deploy workflow (GitHub Actions
# secrets/variables via ssh-action `envs`), then installs / migrates / restarts,
# and health-checks the services so a crash-loop can't report a green deploy.
set -euo pipefail

REPO_DIR="${DEPLOY_REPO_DIR:-$HOME/devflow}"
cd "$REPO_DIR"

ENV_FILE="./.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

# Write/overwrite a single KEY=value line in $ENV_FILE (value written verbatim —
# quote multi-line values yourself). A prior assignment for the same key, if
# any, is removed first.
set_env() {
  local key="$1" val="$2"
  sed -i "/^${key}=/d" "$ENV_FILE"   # no-op if the key is absent
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

# --- Render .env from GitHub-provided values.
# systemd reads .env via EnvironmentFile=, so these must live on disk here (the
# SSH session's env does NOT reach the services). We touch only the keys below;
# server-local secrets (DATABASE_URL, GITHUB_WEBHOOK_SECRET, POSTGRES_PASSWORD)
# are left as-is. Actions labels (DEVFLOW_*) map back to the runtime env-var
# names config.ts reads (GITHUB_APP_ID, ...).
set_env GITHUB_APP_ID            "${DEVFLOW_APP_ID:?DEVFLOW_APP_ID (Actions variable) is required}"
set_env GITHUB_INSTALLATION_ID   "${DEVFLOW_APP_INSTALLATION_ID:?DEVFLOW_APP_INSTALLATION_ID (Actions secret) is required}"
set_env DEVFLOW_PROVIDER_API_KEY "${DEVFLOW_PROVIDER_API_KEY:?DEVFLOW_PROVIDER_API_KEY (Actions secret) is required}"
set_env DEVFLOW_PROVIDER_MODEL   "${DEVFLOW_PROVIDER_MODEL:?DEVFLOW_PROVIDER_MODEL (Actions variable) is required}"
set_env DEVFLOW_REPO_OWNER       "${DEVFLOW_REPO_OWNER:?DEVFLOW_REPO_OWNER (Actions variable) is required}"
set_env DEVFLOW_REPO_NAME        "${DEVFLOW_REPO_NAME:?DEVFLOW_REPO_NAME (Actions variable) is required}"
# Optional — only written when set (official Anthropic API users leave it unset).
[ -n "${DEVFLOW_PROVIDER_BASE_URL:-}" ] && set_env DEVFLOW_PROVIDER_BASE_URL "$DEVFLOW_PROVIDER_BASE_URL"

# GitHub App private key — read from a server-local file so it never enters
# GitHub. Multi-line PEM wrapped in double quotes: both bash sourcing and
# systemd EnvironmentFile parse it as a single value (verified on systemd).
PEM_PATH="${DEVFLOW_PEM_PATH:-$HOME/mbzdevflow.2026-06-19.private-key.pem}"
[ -f "$PEM_PATH" ] || { echo "PEM not found at $PEM_PATH (set DEVFLOW_PEM_PATH)" >&2; exit 1; }
PEM_BODY="$(<"$PEM_PATH")"
set_env GITHUB_PRIVATE_KEY "\"$PEM_BODY\""

# --- Build / migrate. Export .env so pnpm migrate sees DATABASE_URL etc.
set -o allexport
# shellcheck disable=SC1091
. "$ENV_FILE"
set +o allexport

git fetch --all --prune
git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm migrate

# --- Restart + health check. `systemctl restart` returns 0 for Type=simple as
# soon as the process forks — it does NOT prove the service stays up, so a
# crash-loop would otherwise look like a successful deploy. Poll is-active for a
# few seconds; if either service isn't active, dump its journal and fail.
sudo systemctl restart devflow-serve devflow-worker
for svc in devflow-serve devflow-worker; do
  ok=0
  for _ in 1 2 3 4 5; do
    if sudo systemctl is-active --quiet "$svc"; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" != 1 ]; then
    echo "ERROR: $svc not active after restart" >&2
    sudo journalctl -u "$svc" --no-pager -n 30 >&2 || true
    exit 1
  fi
done

echo "deployed $(git rev-parse --short HEAD)"

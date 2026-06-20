#!/usr/bin/env bash
# Run on the server — over SSH from the deploy workflow, or manually.
# Pulls origin/main, installs deps, runs migrations, restarts the services.
set -euo pipefail

REPO_DIR="${DEPLOY_REPO_DIR:-$HOME/devflow}"
cd "$REPO_DIR"

# .env lives on the server (gitignored): DB url, GitHub App creds, provider key.
set -o allexport
# shellcheck disable=SC1091
. ./.env
set +o allexport

git fetch --all --prune
git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm migrate

# Requires: the deploy account can run this without a password prompt, e.g. a
# sudoers NOPASSWD rule, OR replace with `systemctl --user` after
# `loginctl enable-linger <user>`.
sudo systemctl restart devflow-serve devflow-worker

echo "deployed $(git rev-parse --short HEAD)"

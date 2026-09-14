#!/bin/bash

# ==============================================================================
# configure-email-alerts.sh
#
# One-time setup: sets the SMTP_USERNAME/SMTP_PASSWORD/ALERT_EMAIL
# repository secrets publish-web.yml needs to send an alarming email
# whenever a data source fails during collection (see
# ../.github/workflows/publish-web.yml). All three are secrets — including
# the destination address — so nothing personal ends up hardcoded in this
# public repo's workflow file or history. The email step only runs once
# all three are set; skipping this script just means no email is sent.
#
# Runs entirely inside a Docker container with the GitHub CLI (gh)
# installed — no local `gh` install needed, consistent with the rest of
# this repo (cli/, mobile-app/).
#
# Usage:
#   GH_TOKEN=<your-github-token> \
#   SMTP_USERNAME=<your-gmail-address> \
#   SMTP_PASSWORD=<a-gmail-app-password> \
#   ALERT_EMAIL=<where-to-send-the-alert> \
#     ./scripts/configure-email-alerts.sh
#
# ALERT_EMAIL is optional — defaults to SMTP_USERNAME (email yourself)
# when not given.
#
# SMTP_USERNAME/SMTP_PASSWORD: a Gmail account and an App Password for it
# (not its normal login password) — generate one at
# https://myaccount.google.com/apppasswords (needs 2-Step Verification
# enabled first).
#
# GH_TOKEN needs write access to this repo's secrets:
#   - Classic PAT: the "repo" scope.
#   - Fine-grained PAT: "Secrets: Read and write" on this repository.
# Create one at https://github.com/settings/tokens. All values are only
# ever passed as environment variables into the container — never written
# to disk or committed anywhere by this script.
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_TAG="rikiki-configure-github-pages"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Error: GH_TOKEN is not set." >&2
  echo "Usage: GH_TOKEN=<token> SMTP_USERNAME=<gmail> SMTP_PASSWORD=<app-password> $0" >&2
  echo "Create a token at https://github.com/settings/tokens ('repo' scope, or fine-grained Secrets: Read and write)." >&2
  exit 1
fi

if [[ -z "${SMTP_USERNAME:-}" ]]; then
  echo "Error: SMTP_USERNAME is not set (your Gmail address)." >&2
  exit 1
fi

if [[ -z "${SMTP_PASSWORD:-}" ]]; then
  echo "Error: SMTP_PASSWORD is not set (a Gmail App Password, not your normal password)." >&2
  echo "Generate one at https://myaccount.google.com/apppasswords" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed or not on the PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not responding. Check that Docker is running." >&2
  exit 1
fi

echo "Building the gh-cli helper image..."
docker build -t "$IMAGE_TAG" "$DIR/configure-github-pages" >/dev/null

echo "Setting the email-alert secrets..."
docker run --rm \
  --entrypoint /usr/local/bin/set-email-secrets.sh \
  -e GH_TOKEN \
  -e SMTP_USERNAME \
  -e SMTP_PASSWORD \
  -e ALERT_EMAIL \
  -e "REPO=${REPO:-jlmc/rikiki-social-event-discovery}" \
  "$IMAGE_TAG"

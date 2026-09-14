#!/bin/bash

# ==============================================================================
# trigger-web-refresh.sh
#
# Forces the publish-web.yml workflow to run right now, instead of waiting
# for its next 6-hour scheduled run — use any time you want web/ to show
# fresh data immediately. Does NOT touch GitHub Pages settings — for the
# one-time setup that does that, see configure-github-pages.sh.
#
# Runs entirely inside a Docker container with the GitHub CLI (gh)
# installed — no local `gh` install needed.
#
# Usage:
#   GH_TOKEN=<your-github-token> ./scripts/trigger-web-refresh.sh
#
# SIMULATE_FAILURE=true tests the email-alert step on demand — forces this
# one run's "source failed" condition without touching any real provider
# or the deployed events.json:
#   GH_TOKEN=<your-github-token> SIMULATE_FAILURE=true ./scripts/trigger-web-refresh.sh
#
# See scripts/README.md for the token permissions needed.
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_TAG="rikiki-configure-github-pages"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Error: GH_TOKEN is not set." >&2
  echo "Usage: GH_TOKEN=<your-github-token> $0" >&2
  echo "See scripts/README.md for the token permissions needed." >&2
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

echo "Triggering the workflow..."
docker run --rm \
  --entrypoint /usr/local/bin/trigger.sh \
  -e GH_TOKEN \
  -e "REPO=${REPO:-jlmc/rikiki-social-event-discovery}" \
  -e "WORKFLOW_FILE=${WORKFLOW_FILE:-publish-web.yml}" \
  -e "SIMULATE_FAILURE=${SIMULATE_FAILURE:-false}" \
  "$IMAGE_TAG"

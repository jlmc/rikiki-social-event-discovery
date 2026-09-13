#!/bin/bash

# ==============================================================================
# configure-github-pages.sh
#
# One-time setup: configures this repo's GitHub Pages to build from GitHub
# Actions (Settings -> Pages -> Source: GitHub Actions) and immediately
# triggers the publish-web.yml workflow, so web/ has real data to show
# right away instead of waiting for the next scheduled run.
#
# Runs entirely inside a Docker container with the GitHub CLI (gh)
# installed — no local `gh` install needed, consistent with the rest of
# this repo (cli/, mobile-app/).
#
# Usage:
#   GH_TOKEN=<your-github-token> ./scripts/configure-github-pages.sh
#
# The token needs write access to this repo's Administration (to change
# Pages settings) and Actions (to trigger a workflow run):
#   - Classic PAT: the "repo" and "workflow" scopes.
#   - Fine-grained PAT: "Administration: Read and write" and
#     "Actions: Read and write" on this repository.
# Create one at https://github.com/settings/tokens. The token is only
# ever passed as an environment variable into the container — never
# written to disk or committed anywhere by this script.
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
IMAGE_TAG="rikiki-configure-github-pages"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Error: GH_TOKEN is not set." >&2
  echo "Usage: GH_TOKEN=<your-github-token> $0" >&2
  echo "Create a token at https://github.com/settings/tokens" >&2
  echo "(classic PAT: 'repo' + 'workflow' scopes; fine-grained: Administration + Actions write)." >&2
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

echo "Configuring GitHub Pages and triggering the first data collection..."
docker run --rm \
  -e GH_TOKEN \
  -e "REPO=${REPO:-jlmc/rikiki-social-event-discovery}" \
  -e "WORKFLOW_FILE=${WORKFLOW_FILE:-publish-web.yml}" \
  "$IMAGE_TAG"

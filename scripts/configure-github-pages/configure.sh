#!/usr/bin/env bash
set -euo pipefail

# Configures the repo's GitHub Pages to build from GitHub Actions (the
# equivalent of Settings -> Pages -> Source: GitHub Actions), then
# immediately triggers the publish-web.yml workflow so there's real data
# live right away, instead of waiting for the next 6-hour scheduled run.
#
# Only needs to run once per repository — see trigger.sh for a lighter
# command that just (re-)triggers the workflow on demand afterwards.
#
# Required/optional env vars: see lib.sh's require_gh_token and this
# repo's scripts/README.md.

source /usr/local/lib/gh-pages/lib.sh

REPO="${REPO:-jlmc/rikiki-social-event-discovery}"
WORKFLOW_FILE="${WORKFLOW_FILE:-publish-web.yml}"

require_gh_token
authenticate

echo
echo "== Enabling GitHub Pages (source: GitHub Actions) for $REPO =="
if gh api "repos/$REPO/pages" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -X POST -f build_type=workflow >/tmp/pages-create.json 2>/tmp/pages-create.err; then
  echo "Pages site created."
else
  if grep -q "already exists" /tmp/pages-create.err 2>/dev/null || grep -qi "409" /tmp/pages-create.err 2>/dev/null; then
    echo "Pages site already exists — updating its build type instead."
    gh api "repos/$REPO/pages" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -X PUT -f build_type=workflow
  else
    echo "Error enabling GitHub Pages:" >&2
    cat /tmp/pages-create.err >&2
    exit 1
  fi
fi

trigger_and_watch_workflow "$REPO" "$WORKFLOW_FILE"

echo
echo "== Done =="
PAGES_URL="$(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || true)"
if [[ -n "$PAGES_URL" ]]; then
  echo "Site: $PAGES_URL"
else
  echo "Pages is configured; check Settings -> Pages on GitHub for the URL (it can take a minute to appear)."
fi

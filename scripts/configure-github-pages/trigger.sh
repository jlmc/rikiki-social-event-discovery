#!/usr/bin/env bash
set -euo pipefail

# Forces the publish-web.yml workflow to run right now, instead of waiting
# for its next 6-hour scheduled run — use this any time you want fresh
# data on web/ immediately (e.g. right after fixing a provider). Does not
# touch the GitHub Pages settings themselves — see configure.sh for the
# one-time setup that also does that.

source /usr/local/lib/gh-pages/lib.sh

REPO="${REPO:-jlmc/rikiki-social-event-discovery}"
WORKFLOW_FILE="${WORKFLOW_FILE:-publish-web.yml}"

require_gh_token
authenticate

trigger_and_watch_workflow "$REPO" "$WORKFLOW_FILE"

echo
echo "== Done =="
PAGES_URL="$(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || true)"
[[ -n "$PAGES_URL" ]] && echo "Site: $PAGES_URL"

#!/usr/bin/env bash
set -euo pipefail

# Forces the publish-web.yml workflow to run right now, instead of waiting
# for its next 6-hour scheduled run — use this any time you want fresh
# data on web/ immediately (e.g. right after fixing a provider). Does not
# touch the GitHub Pages settings themselves — see configure.sh for the
# one-time setup that also does that.
#
# SIMULATE_FAILURE=true tests the email-alert step on demand — it forces
# this one run's "source failed" condition without touching any real
# provider or the deployed events.json (see publish-web.yml).

source /usr/local/lib/gh-pages/lib.sh

REPO="${REPO:-jlmc/rikiki-social-event-discovery}"
WORKFLOW_FILE="${WORKFLOW_FILE:-publish-web.yml}"

require_gh_token
authenticate

if [[ "${SIMULATE_FAILURE:-false}" == "true" ]]; then
  trigger_and_watch_workflow "$REPO" "$WORKFLOW_FILE" -f simulate_failure=true
else
  trigger_and_watch_workflow "$REPO" "$WORKFLOW_FILE"
fi

echo
echo "== Done =="
PAGES_URL="$(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || true)"
[[ -n "$PAGES_URL" ]] && echo "Site: $PAGES_URL"

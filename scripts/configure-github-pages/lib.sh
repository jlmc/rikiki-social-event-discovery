#!/usr/bin/env bash
# Shared helpers for configure.sh and trigger.sh.

require_gh_token() {
  if [[ -z "${GH_TOKEN:-}" ]]; then
    echo "Error: GH_TOKEN is not set." >&2
    echo "Create a token at https://github.com/settings/tokens and pass it as:" >&2
    echo "  docker run --rm -e GH_TOKEN=<your-token> ..." >&2
    exit 1
  fi
}

authenticate() {
  echo "== Authenticating gh CLI =="
  echo "$GH_TOKEN" | gh auth login --with-token
  gh auth status
}

# Triggers a workflow_dispatch run and watches it to completion, printing
# progress as it goes. Exits non-zero if the run fails.
trigger_and_watch_workflow() {
  local repo="$1" workflow_file="$2"

  echo
  echo "== Triggering $workflow_file now =="
  gh workflow run "$workflow_file" --repo "$repo"

  echo "Waiting for the run to be picked up..."
  local run_id=""
  for _ in $(seq 1 15); do
    run_id="$(gh run list --repo "$repo" --workflow "$workflow_file" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [[ -n "$run_id" ]] && break
    sleep 2
  done

  if [[ -z "$run_id" ]]; then
    echo "Warning: could not find the triggered run yet — check the Actions tab manually." >&2
    return 1
  fi

  echo "Watching run $run_id (this runs the real scraping — can take a few minutes)..."
  if ! gh run watch "$run_id" --repo "$repo" --exit-status; then
    echo "Warning: the workflow run did not succeed — check its logs:" >&2
    echo "  gh run view $run_id --repo $repo --log" >&2
    return 1
  fi
}

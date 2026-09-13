#!/bin/bash

# ==============================================================================
# list-events.sh
#
# Lists real cultural and family events in the Coimbra region (and nearby
# municipalities) between a start and an end date.
#
# Two-step pipeline, each step in its own node:24-alpine container (pinned
# version, instead of the floating "alpine" tag):
#   1) collect-events.js — WITH network access: scrapes real sources
#      (agenda.coimbra.pt, coimbraconvento.pt, viralagenda.com, bol.pt) and
#      writes events.json.
#   2) list-events.js    — WITHOUT network access (--network none): reads
#      events.json and filters/prints the results. Never touches the
#      network, even though step 1 just installed a third-party dependency
#      (cheerio).
# Argument and Docker environment validation happens here, in Bash.
#
# Usage: ./list-events.sh -end <YYYY-MM-DD> [-start <YYYY-MM-DD>] [-location <text>] [-type <text>] [-format <text|json>]
#        ./list-events.sh -location help
#
# -type matches each source's own category text, which is in Portuguese
# (e.g. "teatro", "concertos", "infantil") since these are Portuguese sites
# — not a fixed, translated list of types.
#
# -format defaults to "text"; "json" prints the filtered results as JSON on
# stdout instead (source-failure warnings still go to stderr either way).
#
# Examples:
#   ./list-events.sh -end 2026-12-31
#   ./list-events.sh -end 2026-12-31 -location coimbra
#   ./list-events.sh -end 2026-12-31 -start 2026-10-01 -type teatro
#   ./list-events.sh -end 2026-12-31 -format json
#   ./list-events.sh -location help
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DATE_REGEX='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
# Node 24 is the current Active LTS (since 2025-10-28); pinning the version
# keeps the floating "alpine" tag (always pointing at the latest release)
# from silently changing this script's behaviour between runs.
DOCKER_IMAGE="node:24-alpine"

START=""
END=""
LOCATION=""
TYPE=""
FORMAT=""

usage() {
  echo "Usage: $0 -end <YYYY-MM-DD> [-start <YYYY-MM-DD>] [-location <text>] [-type <text>] [-format <text|json>]"
  echo "       $0 -location help"
  echo
  echo "-type matches each source's own (Portuguese) category text, e.g. \"teatro\", \"concertos\"."
  echo "-format defaults to \"text\"; \"json\" prints the filtered results as JSON on stdout."
  echo
  echo "Examples:"
  echo "  $0 -end 2026-12-31"
  echo "  $0 -end 2026-12-31 -location coimbra"
  echo "  $0 -end 2026-12-31 -start 2026-10-01 -type teatro"
  echo "  $0 -end 2026-12-31 -format json"
  echo "  $0 -location help"
}

# --- Argument parsing ----------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -start)
      START="${2:-}"; [[ $# -ge 2 ]] || { echo "Error: -start needs a value." >&2; usage; exit 1; }
      shift 2
      ;;
    -end)
      END="${2:-}"; [[ $# -ge 2 ]] || { echo "Error: -end needs a value." >&2; usage; exit 1; }
      shift 2
      ;;
    -location)
      LOCATION="${2:-}"; [[ $# -ge 2 ]] || { echo "Error: -location needs a value." >&2; usage; exit 1; }
      shift 2
      ;;
    -type)
      TYPE="${2:-}"; [[ $# -ge 2 ]] || { echo "Error: -type needs a value." >&2; usage; exit 1; }
      shift 2
      ;;
    -format)
      FORMAT="${2:-}"; [[ $# -ge 2 ]] || { echo "Error: -format needs a value." >&2; usage; exit 1; }
      shift 2
      ;;
    -h|-help|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown parameter \"$1\"." >&2
      usage
      exit 1
      ;;
  esac
done

# --- Docker environment validation ---------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed or not on the PATH." >&2
  echo "Install Docker Desktop (macOS/Windows) or Docker Engine (Linux) and try again." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not responding. Check that Docker is running." >&2
  exit 1
fi

# "-location help" is a standalone request: it doesn't need -end, and since
# it never reads events.json either, it can skip the network-enabled
# collection step entirely.
if [[ "$LOCATION" == "help" ]]; then
  docker run --rm --network none \
    -v "$DIR":/app -w /app \
    "$DOCKER_IMAGE" node list-events.js -location help
  exit $?
fi

if [[ -z "$END" ]]; then
  echo "Error: -end is required." >&2
  usage
  exit 1
fi

if [[ ! "$END" =~ $DATE_REGEX ]]; then
  echo "Error: -end \"$END\" is not in YYYY-MM-DD format." >&2
  usage
  exit 1
fi

if [[ -n "$START" && ! "$START" =~ $DATE_REGEX ]]; then
  echo "Error: -start \"$START\" is not in YYYY-MM-DD format." >&2
  usage
  exit 1
fi

# YYYY-MM-DD strings sort lexicographically the same way they sort
# chronologically, so a plain string comparison is enough here — no need
# to invoke `date` (whose flags differ between macOS/BSD and Linux/GNU).
if [[ -n "$START" && "$START" > "$END" ]]; then
  echo "Error: -end ($END) must be on or after -start ($START)." >&2
  exit 1
fi

# --- Step 1: collection (with network) -----------------------------------------
echo "Collecting events from real sources (agenda.coimbra.pt, coimbraconvento.pt, viralagenda.com, bol.pt)..."

docker run --rm \
  -v "$DIR":/app -w /app \
  "$DOCKER_IMAGE" sh -c "npm install --silent --no-audit --no-fund && node collect-events.js"

echo

# --- Step 2: presentation (without network) -------------------------------------
echo "Listing events${START:+ from $START} up to $END${LOCATION:+ (location: \"$LOCATION\")}${TYPE:+ (type: \"$TYPE\")}..."
echo

ARGS=(-end "$END")
[[ -n "$START" ]] && ARGS+=(-start "$START")
[[ -n "$LOCATION" ]] && ARGS+=(-location "$LOCATION")
[[ -n "$TYPE" ]] && ARGS+=(-type "$TYPE")
[[ -n "$FORMAT" ]] && ARGS+=(-format "$FORMAT")

docker run --rm --network none \
  -v "$DIR":/app -w /app \
  "$DOCKER_IMAGE" node list-events.js "${ARGS[@]}"

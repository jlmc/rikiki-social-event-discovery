#!/bin/bash

# ==============================================================================
# start-mobile-app.sh
#
# Runs the Expo dev server (Metro bundler) for the mobile app inside a
# Docker container — no local Node.js install needed, consistent with the
# rest of this repository (see ../cli/list-events.sh).
#
# Uses `node:24` (Debian), not `node:24-alpine`: some native packages in
# the Expo ecosystem have known issues building on Alpine's musl libc, and
# since this only runs the JS dev server (no native build happens here),
# the larger, more compatible image is the safer choice.
#
# Prints a QR code you can scan with the "Expo Go" app (iOS/Android) to run
# the app on your own phone — this is the only way to test the real
# scraping in this project without installing Xcode/Android Studio, since
# React Native's fetch() (unlike a browser's) isn't subject to CORS, and
# Expo Go lets you run that on a real device without a native build.
#
# NOTE: `expo start --web` (see package.json's "web" script) previews the
# UI on the computer, but runs the app inside an actual browser engine —
# so the real scraping hits the CORS wall again there. It's useful for
# checking layout, not for testing search results.
#
# Usage: ./start-mobile-app.sh
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DOCKER_IMAGE="node:24"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed or not on the PATH." >&2
  echo "Install Docker Desktop (macOS/Windows) or Docker Engine (Linux) and try again." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not responding. Check that Docker is running." >&2
  exit 1
fi

# The QR code Expo prints has to point at an address your phone can reach
# on the same Wi-Fi — not the container's internal IP. We detect this
# machine's LAN IP and pass it through explicitly.
HOST_LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

if [[ -z "$HOST_LAN_IP" ]]; then
  echo "Warning: could not auto-detect this machine's LAN IP (tried en0/en1)." >&2
  echo "If the QR code doesn't work on your phone, set it manually, e.g.:" >&2
  echo "  EXPO_PACKAGER_HOSTNAME=192.168.1.23 ./start-mobile-app.sh" >&2
  HOST_LAN_IP="${EXPO_PACKAGER_HOSTNAME:-}"
fi

echo "Starting the Expo dev server (Docker, no local Node.js needed)..."
[[ -n "$HOST_LAN_IP" ]] && echo "Using LAN IP for the QR code: $HOST_LAN_IP"
echo "Once the QR code appears, scan it with the 'Expo Go' app on your phone."
echo

docker run --rm -it \
  -p 8081:8081 \
  -e "EXPO_PACKAGER_HOSTNAME=${HOST_LAN_IP}" \
  -e CI=1 \
  -v "$DIR":/app -w /app \
  "$DOCKER_IMAGE" sh -c "npm install && npx expo start --lan"

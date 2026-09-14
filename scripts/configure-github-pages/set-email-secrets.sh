#!/usr/bin/env bash
set -euo pipefail

# Sets the three repository secrets publish-web.yml needs to send an
# alarming email when a source fails during collection (see
# .github/workflows/publish-web.yml and ../README.md for the full
# picture). SMTP_USERNAME is a Gmail address, SMTP_PASSWORD is an App
# Password for that account (not its normal login password) — generate
# one at https://myaccount.google.com/apppasswords (needs 2-Step
# Verification enabled first). ALERT_EMAIL is where the alert goes; it's
# its own secret (not hardcoded in the workflow) so it isn't exposed in
# this public repo's history — defaults to SMTP_USERNAME (email yourself)
# when not given explicitly.

source /usr/local/lib/gh-pages/lib.sh

REPO="${REPO:-jlmc/rikiki-social-event-discovery}"

if [[ -z "${SMTP_USERNAME:-}" ]]; then
  echo "Error: SMTP_USERNAME is not set (your Gmail address)." >&2
  exit 1
fi
if [[ -z "${SMTP_PASSWORD:-}" ]]; then
  echo "Error: SMTP_PASSWORD is not set (a Gmail App Password, not your normal password)." >&2
  echo "Generate one at https://myaccount.google.com/apppasswords" >&2
  exit 1
fi

ALERT_EMAIL="${ALERT_EMAIL:-$SMTP_USERNAME}"

require_gh_token
authenticate

echo
echo "== Setting SMTP_USERNAME, SMTP_PASSWORD and ALERT_EMAIL secrets on $REPO =="
gh secret set SMTP_USERNAME --repo "$REPO" --body "$SMTP_USERNAME"
gh secret set SMTP_PASSWORD --repo "$REPO" --body "$SMTP_PASSWORD"
gh secret set ALERT_EMAIL --repo "$REPO" --body "$ALERT_EMAIL"

echo
echo "== Done =="
echo "publish-web.yml will now email $ALERT_EMAIL whenever a data source fails during collection."

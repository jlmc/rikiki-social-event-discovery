# scripts

Repo-maintenance tooling that isn't part of any of the three product modules
([`../cli`](../cli/README.md), [`../mobile-app`](../mobile-app/README.md), [`../web`](../web/README.md)).

## `configure-github-pages.sh`

One-time setup for [`../web`](../web/README.md): configures this repository's GitHub Pages to
build from GitHub Actions, then immediately triggers the `publish-web.yml` workflow so the
site has real data right away.

```bash
GH_TOKEN=<your-github-token> ./configure-github-pages.sh
```

Runs entirely inside a Docker container with the GitHub CLI (`gh`) installed — no local `gh`
install needed, consistent with the rest of this repo. The token is only ever passed in as an
environment variable for that one container run; this script never writes it to disk or
commits it anywhere.

**Token permissions needed** (create one at
[github.com/settings/tokens](https://github.com/settings/tokens)):
- Classic PAT: the `repo` and `workflow` scopes.
- Fine-grained PAT: `Administration: Read and write` (to change the Pages source) and
  `Actions: Read and write` (to trigger a workflow run) on this repository.

This only needs to run once per repository — after GitHub Pages' source is set to "GitHub
Actions", [`publish-web.yml`](../.github/workflows/publish-web.yml) keeps itself going on its
own schedule without needing this script again. Re-running it is harmless (it just re-applies
the same setting and triggers one more manual run).

## `trigger-web-refresh.sh`

Forces `publish-web.yml` to run right now — use this any time you want fresh data on
[`../web`](../web/README.md) immediately, instead of waiting for the next scheduled run (e.g.
right after fixing a provider). Doesn't touch GitHub Pages settings at all.

```bash
GH_TOKEN=<your-github-token> ./trigger-web-refresh.sh
```

Same Docker image and token permissions as `configure-github-pages.sh` above.

**Testing the email alert on demand**, without waiting for (or faking) a real provider
failure: `SIMULATE_FAILURE=true` makes that one run's "a source failed" condition true, so the
alarming email fires (once `configure-email-alerts.sh` below has been run) — it never touches
any real provider or the deployed `events.json`/warning banner, only this run's email step.

```bash
GH_TOKEN=<your-github-token> SIMULATE_FAILURE=true ./trigger-web-refresh.sh
```

## `configure-email-alerts.sh`

One-time setup for the alarming email `publish-web.yml` sends whenever a data source fails
during collection (see [`../.github/workflows/publish-web.yml`](../.github/workflows/publish-web.yml)).
Sets the three repository secrets that step needs:

```bash
GH_TOKEN=<your-github-token> \
SMTP_USERNAME=<your-gmail-address> \
SMTP_PASSWORD=<a-gmail-app-password> \
ALERT_EMAIL=<where-to-send-the-alert> \
  ./configure-email-alerts.sh
```

`SMTP_USERNAME`/`SMTP_PASSWORD` are a Gmail account and an **App Password** for it — not its
normal login password. Generate one at
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (needs
2-Step Verification enabled on the account first). `ALERT_EMAIL` is optional and defaults to
`SMTP_USERNAME` (email yourself) — it's its own secret, not hardcoded in the workflow, so no
personal address ends up committed in this public repo's history.

The workflow's email step checks that `SMTP_USERNAME`, `SMTP_PASSWORD` and `ALERT_EMAIL` are
all set before running — until this script has been run once, it's a silent no-op rather than
a failure.

Same Docker image as the two scripts above, with a different entrypoint. `GH_TOKEN` needs
the `repo` scope (classic PAT) or `Secrets: Read and write` (fine-grained PAT) on this
repository. All values are only ever passed in as environment variables for that one
container run — never written to disk or committed anywhere.

This only needs to run once per repository; the secrets persist until changed. Re-running it
just overwrites both secrets with whatever you pass in.

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
normal login password; Gmail's SMTP rejects the normal password once 2-Step Verification is
on ("Less secure app access" no longer exists). `ALERT_EMAIL` is optional and defaults to
`SMTP_USERNAME` (email yourself) — it's its own secret, not hardcoded in the workflow, so no
personal address ends up committed in this public repo's history.

### Generating the Gmail App Password

1. On the Gmail account that will send the alert, go to **Google Account → Segurança e
   início de sessão** and confirm **Verificação em 2 passos** is on — the App Passwords
   option is hidden entirely until it is.
2. Go directly to
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (it isn't
   linked from the main Security page's menu).
3. Give it any name (e.g. `rikiki-github-actions`) and create it.
4. Google shows a 16-character password in 4 groups (e.g. `abcd efgh ijkl mnop`) — use it
   **without the spaces** as `SMTP_PASSWORD`.

**Treat that password like any other secret**: never paste it into a chat, an issue, a commit,
or a screenshot — anywhere it could be logged or persisted outside your own terminal. Type or
paste it directly into the `SMTP_PASSWORD=...` command below, in your own shell, not
anywhere else. If it's ever exposed by accident, revoke it immediately from the same
"Palavras-passe de apps" page (a trash icon next to its name) and generate a fresh one before
using it.

### Troubleshooting: "Invalid login: 535-5.7.8 Username and Password not accepted"

This shows up as an **annotation** on the workflow run (visible even without signing in, on
the run's summary page) — the email step's `continue-on-error: true` means the job itself
still shows "success" even though the send failed, so the annotation is the actual signal to
check, not the job's overall status. It means Gmail rejected `SMTP_USERNAME`/`SMTP_PASSWORD`.
Most common causes, roughly in order of likelihood:
- `SMTP_PASSWORD` is the account's normal login password, not an App Password.
- 2-Step Verification isn't actually enabled on that account (App Passwords silently doesn't
  work without it, even if you have an old one saved).
- The App Password was copied with its spaces still in it.
- `SMTP_USERNAME` doesn't match the Google account the App Password was generated on.

Fix: generate a fresh App Password (see above) and re-run `configure-email-alerts.sh` with
it.

The workflow's email step checks that `SMTP_USERNAME`, `SMTP_PASSWORD` and `ALERT_EMAIL` are
all set before running — until this script has been run once, it's a silent no-op rather than
a failure.

Same Docker image as the two scripts above, with a different entrypoint. `GH_TOKEN` needs
the `repo` scope (classic PAT) or `Secrets: Read and write` (fine-grained PAT) on this
repository. All values are only ever passed in as environment variables for that one
container run — never written to disk or committed anywhere.

This only needs to run once per repository; the secrets persist until changed. Re-running it
just overwrites all three secrets with whatever you pass in.

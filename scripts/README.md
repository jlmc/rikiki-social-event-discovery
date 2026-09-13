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

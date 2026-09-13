# rikiki-social-event-discovery

Discovers **real** cultural and family events in the Coimbra region (and nearby
municipalities), from live public sources — no invented data. The repository has three
independent modules, all sharing the same real data sources and the same filtering rules
(location, type, date range) — independent front-ends over the same idea, not separate
products:

- **[`cli/`](cli/README.md)** — a Docker-based command-line tool. Runs entirely inside
  `node:24-alpine` containers (no local Node.js install needed); a network-enabled step
  scrapes the real sources into `events.json`, and a `--network none` step filters/prints the
  results (as text or JSON).
- **[`mobile-app/`](mobile-app/README.md)** — an Expo/React Native app that does the same
  scraping and filtering **on-device** (phone or tablet), with no server and no file written
  to disk. See its README for why this needed a different tech stack (React Native's `fetch`
  isn't subject to the browser CORS restriction that a plain web page would hit against these
  sources) and how to try it via the free "Expo Go" app, without installing Xcode/Android
  Studio.
- **[`web/`](web/README.md)** — a static site published on **GitHub Pages**: open a URL, no
  phone needed. Since GitHub Pages can't run a server and the browser still can't scrape the
  4 sources directly (same CORS restriction as above), the scraping runs periodically in
  GitHub Actions instead (reusing `cli/collect-events.js` unchanged), publishing a fresh
  `events.json` next to the static page every few hours — the browser only ever reads that
  one same-origin file. One-time setup and on-demand data refresh for this module are handled
  by [`scripts/`](scripts/README.md), not manually.

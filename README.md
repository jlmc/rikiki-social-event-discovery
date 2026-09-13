# rikiki-social-event-discovery

Discovers **real** cultural and family events in the Coimbra region (and nearby
municipalities), from live public sources — no invented data. The repository has two
independent modules:

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

Both modules share the same real data sources and the same filtering rules (location, type,
date range) — they're independent front-ends over the same idea, not two different products.

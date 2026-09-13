# rikiki mobile app (Expo / React Native)

An on-device search UI over the same real cultural/family events as [`../cli`](../cli/README.md)
— but with **no server** and **no file written to disk**. Select filters, search, and browse
the results as cards, each with a "see full details" popup and a link to the event's official
page. Everything (scraping the real sources, filtering, rendering) runs on your phone.

## Why this isn't just a website

An earlier design tried a plain web page (server or PWA) for this. It doesn't work: none of
the 4 real sources this project scrapes (`agenda.coimbra.pt`, `viralagenda.com`,
`coimbraconvento.pt`, `bol.pt`) send CORS headers, so a browser blocks `fetch()` calls to them
from any page's JavaScript — confirmed with `curl -H "Origin: ..."` during development, no
`Access-Control-Allow-Origin` in any response. That block is enforced by the browser itself and
can't be worked around from client-side code.

**React Native doesn't have this problem.** It doesn't render its UI in a WebView — `fetch()`
here is served by native networking (similar to Node's `fetch()`, which also never had a CORS
restriction). No special configuration is needed; CORS simply doesn't apply to this runtime.

## Prerequisites

- **Docker** (to run the Expo dev server — see [Running it](#running-it), no local Node.js
  install needed, consistent with [`../cli`](../cli/README.md)).
- A phone with the free **Expo Go** app installed ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
  [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)), on the same
  Wi-Fi network as your computer.

## Running it

```bash
./start-mobile-app.sh
```

This runs `npm install` and `npx expo start` inside a `node:24` Docker container (no local
Node.js needed) and prints a QR code in the terminal. Open **Expo Go** on your phone and scan
it — the app loads and runs there, with real network requests to the 4 sources above.

Previewing on the computer (`npm run web`, i.e. `expo start --web`) works for checking layout,
but **the real search won't return results there** — that mode renders in an actual browser
engine, so it hits the exact same CORS wall described above. Only Expo Go (or a native build,
out of scope for now — see [Limitations](#limitations)) has working native `fetch()`.

## How it works

- Tapping **"Pesquisar"** runs the on-device collection: all 4 providers (ported from
  [`../cli/providers`](../cli/providers)) are called in parallel, each isolated in a
  `try/catch` so one failing source never blocks the others. This can take a little while —
  some providers fetch each event's own detail page (bounded to 4 concurrent requests) to get
  a description and participants, exactly like the CLI does.
- The result is kept in memory (React state) and mirrored to `AsyncStorage`, purely so the app
  has something to show immediately on a cold start instead of a blank screen. This is **not**
  the `events.json`-on-disk artifact the CLI writes — it's a per-device cache managed by React
  Native itself, not a data file this project ships or reads back. An explicit **"Pesquisar"**
  tap always triggers a fresh collection; there's no background/automatic refresh.
- Filtering (date range, location, type) reuses the exact same rule as the CLI —
  [`src/lib/filter-events.js`](src/lib/filter-events.js) is a straight port of
  [`../cli/lib/filter-events.js`](../cli/lib/filter-events.js).
- If a source fails, a visible warning banner appears at the top of the results — same idea as
  the CLI's stderr warning, just rendered in the UI instead.

## Porting notes (what's different from the CLI's code)

- **`node-html-parser` instead of `cheerio`.** There's no Node runtime here, so `cheerio`
  (designed for Node) isn't a fit; `node-html-parser` is a pure-JS HTML parser with a very
  similar `querySelector`/`querySelectorAll` API. Verified during development that it returns
  identical results to `cheerio` against the real pages for every selector used here.
- **`fetchWithTimeout` (AbortController + `setTimeout`) instead of `AbortSignal.timeout()`**,
  for broader compatibility across React Native/Hermes versions.
- **`Linking.openURL()` instead of `<a target="_blank">`** for "official page" — the mobile
  equivalent of opening a new browser tab.
- Everything else — the date-parsing heuristics, the description/participants extraction
  ([`src/lib/text-utils.js`](src/lib/text-utils.js)), the dedupe-by-completeness logic
  ([`src/lib/collect-events.js`](src/lib/collect-events.js)) — is a direct port with no
  behavioural changes.

## Limitations

- **No native build in this repo yet.** Running via Expo Go only requires this project's own
  JS/Metro bundler (handled by `start-mobile-app.sh`). Producing an installable `.ipa`/`.apk`
  for the App Store/Play Store needs either Expo's cloud build service (EAS Build) or a local
  native build — the latter needs Xcode (iOS) or Android Studio (Android) installed, which is
  out of scope here.
- **App icon is a placeholder** (Expo's default) — real icon artwork is a later step.
- This module and [`../cli`](../cli/README.md) are independent: they share the same real
  sources and filtering rules (kept in sync by hand, since the runtimes can't share code
  directly — see "Porting notes" above), but neither depends on the other.

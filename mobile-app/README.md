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
Node.js needed) and prints a QR code in the terminal.

### Testing on a real phone (the only way to test real search)

1. Install the free **Expo Go** app on your phone (iOS/Android — links in
   [Prerequisites](#prerequisites)).
2. Make sure the phone is on the **same Wi-Fi network** as this computer.
3. Run `./start-mobile-app.sh` and wait for the QR code to appear in the terminal.
4. Open Expo Go and scan the QR code (on iPhone, the regular Camera app also works — it offers
   to open Expo Go).
5. The app loads on the phone and searches the 4 real sources for real — this works because
   React Native's `fetch()` isn't subject to the browser CORS restriction described above.

The script tries to auto-detect this machine's LAN IP (`ipconfig getifaddr en0`/`en1`) so the
QR code points somewhere your phone can actually reach — a container's own internal IP would
be useless to a phone on the Wi-Fi. If the QR code doesn't connect (e.g. a different network
interface, a VPN active, or detection just failing), pass it explicitly:

```bash
EXPO_PACKAGER_HOSTNAME=<this-machine's-LAN-IP> ./start-mobile-app.sh
```

(find that IP under System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0`).

### Previewing the layout in a browser (no real search — see below)

```bash
docker run --rm -it -p 8081:8081 -p 19006:19006 \
  -v "$PWD":/app -w /app node:24 sh -c "npm install && npx expo start --web --lan"
```

Opens the same UI at `http://localhost:19006`, still with no local Node.js install. **The real
search won't return results here** — `expo start --web` renders the app inside an actual
browser engine (via `react-native-web`), so it hits the exact same CORS wall described above.
This is only useful for checking layout/navigation, not for testing the scraping. See
["Can this open in a browser like Slack's web app?"](#can-this-open-in-a-browser-like-slacks-web-app)
below for why a browser can't do this app's real job without adding a server back.

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

## Can this open in a browser like Slack's web app?

Not without adding a server back — and that's a real, deliberate trade-off, not a missing
feature. Slack's web app works in a browser because the browser only ever talks to **Slack's
own backend** (same origin, or a backend that explicitly allows it via CORS) — the browser
never fetches, say, a random company's website directly. Slack's servers do that kind of work,
if any, on their side.

This project's browser problem is different: the browser would need to fetch `agenda.coimbra.pt`,
`viralagenda.com`, `coimbraconvento.pt` and `bol.pt` **directly**, and none of them allow it
(no CORS headers — see [above](#why-this-isnt-just-a-website)). There's no version of "just a
web page" that fixes this, because the restriction is enforced by the browser itself, not by
anything in this app's code.

To get a real browser experience (open a URL, no phone needed, no Expo Go), the only way is to
bring a server back: something server-side (in our own infrastructure, not the browser) does
the scraping — exactly like Slack's backend does the equivalent work for Slack — and the
browser only ever talks to that server, which is allowed to set its own CORS headers (or just
be same-origin). This is the earlier "PWA + `server.js`" design from this project's history,
discarded specifically because "sem servidor nenhum" was the explicit requirement at the time.
If that requirement has changed and a browser-first experience matters more now than "no
server, on-device only," that's worth deciding explicitly — it changes the architecture
(a server component comes back, e.g. reusing [`../cli`](../cli/README.md)'s providers behind a
small API), not just this file. It doesn't have to replace this mobile app — the two can
coexist as separate front-ends, same as `cli/` and `mobile-app/` do today.

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

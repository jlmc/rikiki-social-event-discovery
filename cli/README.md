# rikiki-social-event-discovery

CLI that aggregates and lists **real** cultural and family events in the
Coimbra region (and nearby municipalities) between a start and an end date.
The data comes from live scraping of public sources (there is no invented
database) and all processing runs inside Docker containers (`node:24-alpine`)
— no need to install Node.js on the local machine.

## Prerequisites

- **Docker** installed with the daemon running (Docker Desktop on
  macOS/Windows, or Docker Engine on Linux).
- Bash (the script uses `#!/bin/bash`).
- Internet access (only needed for step 1, the data collection).

No local Node.js installation is required.

## Installation

```bash
git clone <this-repository-url>
cd rikiki-social-event-discovery
chmod +x list-events.sh   # usually already executable
```

## Usage

```bash
./list-events.sh -end <YYYY-MM-DD> [-start <YYYY-MM-DD>] [-location <text>] [-type <text>] [-format <text|json>]
./list-events.sh -location help
```

- **`-end <YYYY-MM-DD>`** (required): end of the search window, in ISO
  format. Events are listed up to and including this date.
- **`-start <YYYY-MM-DD>`** (optional): start of the search window. Defaults
  to **now** (the current moment) when omitted, so by default you only see
  upcoming events. `-end` must be on or after `-start`.
- **`-location <text>`** (optional): free-text filter matched against each
  event's location (municipality), case-insensitive and partial. Run
  `./list-events.sh -location help` to print the known locations — it works
  standalone, without `-end`, without network access, and without needing
  the collection step to have run first.
- **`-type <text>`** (optional): free-text filter matched against each
  event's category. This matches each source's own (Portuguese) category
  text (e.g. "teatro", "concertos", "infantil") — not a fixed, translated
  list of types (see [Categories](#categories)).
- **`-format <text|json>`** (optional, defaults to `text`): output format
  for the results. `json` prints `{ query, sources, results }` as JSON on
  stdout instead of the human-readable listing — useful for piping into
  another tool (`jq`, a script, etc.). Source-failure warnings are always
  printed to **stderr** (see [Architecture](#architecture-two-step-pipeline)),
  regardless of `-format`, so stdout in `json` mode is always valid,
  parseable JSON.

### Examples

```bash
./list-events.sh -end 2026-12-31
./list-events.sh -end 2026-12-31 -location coimbra
./list-events.sh -end 2026-12-31 -location "figueira da foz"
./list-events.sh -end 2026-12-31 -type teatro
./list-events.sh -end 2026-12-31 -type infantil
./list-events.sh -end 2026-12-31 -start 2026-10-01 -location aveiro -type concertos
./list-events.sh -end 2026-12-31 -format json
./list-events.sh -end 2026-12-31 -location coimbra -format json | jq '.results | length'
./list-events.sh -location help
```

### Examples by location

```bash
./list-events.sh -end 2026-12-31 -location coimbra
./list-events.sh -end 2026-12-31 -location "figueira da foz"
./list-events.sh -end 2026-12-31 -location soure
./list-events.sh -end 2026-12-31 -location "condeixa-a-nova"
./list-events.sh -end 2026-12-31 -location "montemor-o-velho"
./list-events.sh -end 2026-12-31 -location penela
./list-events.sh -end 2026-12-31 -location pombal
./list-events.sh -end 2026-12-31 -location aveiro
```

Smaller municipalities have less cultural activity recorded in the sources
used than Coimbra or Figueira da Foz — it's not unusual for the filter to
return few or no events, depending on the real agenda at the time you run
the command (that's not a bug). In particular, ViralAgenda's own
per-municipality pages don't always keep a rolling window of upcoming
events: some (observed for Montemor-o-Velho, Penela and even Pombal at
times) can sit with their most recent listed event already in the past,
so a `-location` filter for one of them can legitimately return zero
results until that source's page is updated with new listings.

### Examples by event type

The filter text matches each source's own taxonomy (see
[Categories](#categories)), not a fixed list — so a more generic term tends
to catch more variants (e.g. `teatro` matches both "Teatro" and "Teatro e
Dança").

```bash
./list-events.sh -end 2026-12-31 -type teatro
./list-events.sh -end 2026-12-31 -type concertos
./list-events.sh -end 2026-12-31 -type infantil
./list-events.sh -end 2026-12-31 -type "exposições"
./list-events.sh -end 2026-12-31 -type cinema
./list-events.sh -end 2026-12-31 -type "stand-up"
./list-events.sh -end 2026-12-31 -type festas
./list-events.sh -end 2026-12-31 -type mercados
```

## Architecture: two-step pipeline

```
list-events.sh
  │
  ├─ 1) docker run  (WITH network)     → node collect-events.js  → writes events.json
  │
  └─ 2) docker run  (--network none)   → node list-events.js -end <date> [-start <date>] [-location <text>] [-type <text>]
```

- **Step 1 — collection** (`collect-events.js`, inside the `node:24-alpine`
  container, with network access): runs `npm install` (just the `cheerio`
  dependency, cached in the mounted `node_modules` — only slow on the 1st
  run) and then calls each [provider](#data-sources) in parallel. Each
  source runs isolated in a `try/catch`: if one fails, the others keep
  going normally. Whenever the source allows it, each event is then
  enriched with **description** and **participants** (artists/actors) by
  fetching its own detail page — one extra HTTP request per event, capped
  at 4 concurrent requests per source so as not to overload small
  institutional sites (which is why collection takes longer than a single
  request per source would). The aggregated result, deduplicated (by title
  + day, keeping the most complete version when the same event is
  duplicated) and sorted by date, is written to `events.json`, including
  the status of each source (`ok`/`error`).
- **Step 2 — presentation** (`list-events.js`, inside another
  `node:24-alpine` container, this time with `--network none`): reads
  `events.json`, validates the arguments, filters by the
  `[start, end]` window plus the optional location/type filters, and
  prints the results. **Never has network access** — even though step 1
  just installed a third-party dependency, this step stays isolated as
  defense in depth.

If any source failed during the last collection run, a **clearly visible
warning** always appears at the top of the listing (never a silent
failure):

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
WARNING: 1 source(s) failed during the last collection run:
  - agenda.coimbra.pt: fetch failed
The results below may be incomplete.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

## Data sources

| Provider | File | Confirmed coverage |
|---|---|---|
| Agenda de Coimbra (official, City Council + University of Coimbra) | [`providers/agenda-coimbra.js`](providers/agenda-coimbra.js) | Coimbra (Convento de São Francisco, TAGV, UC Exploratório, Casa Municipal da Cultura, etc.) |
| Convento São Francisco (official, Coimbra Cultura e Congressos) | [`providers/convento-sao-francisco.js`](providers/convento-sao-francisco.js) | Convento São Francisco, with room-level detail (Antiga Igreja, Grande Auditório, etc.) |
| ViralAgenda (nationwide aggregator) | [`providers/viral-agenda.js`](providers/viral-agenda.js) | All 17 municipalities of the Coimbra district (Arganil, Cantanhede, Coimbra, Condeixa-a-Nova, Figueira da Foz — includes the CAE, Góis, Lousã, Mira, Miranda do Corvo, Montemor-o-Velho, Oliveira do Hospital, Pampilhosa da Serra, Penacova, Penela, Soure, Tábua, Vila Nova de Poiares), plus Pombal (general listing + a dedicated concerts-category page, since Pombal's general page only shows its 20 soonest events across all categories and silently drops concerts scheduled further out) and Aveiro |
| BOL — Bilheteira Online (`bol.pt`) | [`providers/bol.js`](providers/bol.js) | Box-office events in the Coimbra, Aveiro and Leiria districts (indirectly covers every requested location) |
| Câmara Municipal de Soure (official) | [`providers/cm-soure.js`](providers/cm-soure.js) | Soure — its own "Eventos" and "Agenda" blog categories (see [note below](#note-on-cm-soures-free-text-dates)) |

### Description and participants

When the source allows it, each event also carries `description` (a
synopsis/summary) and `participants` (artists, actors, cast — when
identifiable). Not every source has both:

- **agenda.coimbra.pt**, **coimbraconvento.pt** and **viralagenda.com**
  come with a description whenever the event's detail page has one, and
  with participants whenever there's a "Ficha Artística/Técnica"
  ("Artistic/Technical credits") section (municipal events) or a "Com
  Fulano, Sicrano, ..." ("With so-and-so, ...") line (ViralAgenda film
  listings). When neither pattern is found, only the description is kept,
  with no participants — we never invent a cast the source didn't give.
- **bol.pt** has neither a reliable description nor participants: the only
  similar field in its JSON-LD (`performers`) is almost always "com
  produção de &lt;company&gt;" ("produced by &lt;company&gt;", the
  production company, not the artists), so this provider doesn't use it —
  presenting it as "participants" would be misleading.

In the CLI, the description is shown summarized (just the 1st paragraph,
up to ~320 characters); the full JSON (`events.json`) always keeps the
complete text.

All sources are server-rendered pages (plain HTML), so collection is a
simple HTTP `fetch()` followed by parsing (with `cheerio`, except BOL,
which already ships structured JSON-LD — see below) — no need to run a
browser inside the container.

BOL is a special case: instead of regular HTML, its homepage ships with
dozens of `<script type="application/ld+json">` blocks in the schema.org
`Event` format (the same one Google uses for event SEO), with name,
date/time and venue already structured — no `cheerio` needed, just
`JSON.parse`. Two limitations to keep in mind:
- BOL's `addressLocality` field is the **district**, not the exact
  municipality — an event in Águeda or Santa Maria da Feira shows up as
  `"Aveiro"` (the district), the same way Figueira da Foz would fall under
  `"Coimbra"`. We keep the value exactly as BOL publishes it, without
  inventing more precision than the source gives.
- BOL doesn't include the event's category/genre — those events always
  show up with `category: "Uncategorized"`, so they're only found through
  location/venue/title filters, not by type.
- BOL's own advanced search (by district/venue) loads results via
  JavaScript, so the scraper always uses the homepage (which already
  ships full of real events) and filters locally to the districts that
  matter, instead of trying to replicate that filter.

### Official sites investigated and not included (with the reason why)

The official sites of other requested locations were evaluated but didn't
get their own scraper — either because they aren't technically feasible
with a plain `fetch()`, or because they're already well covered indirectly
by the sources above. We'd rather document this than force a fragile
scraper or invent data:

| Site | Reason |
|---|---|
| UC Exploratório (`exploratorio.pt/agenda`) | Built on Wix (a client-side SPA, "wix-thunderbolt") — the agenda doesn't come in the server-returned HTML, it would need a real browser. Already covered via ViralAgenda/agenda.coimbra.pt. |
| TAGV (`tagv.pt/agenda`) | The site was down during the investigation (502 Bad Gateway) — an unreliability that would make it a poor source even if it were scrapable. Already covered via ViralAgenda/agenda.coimbra.pt. |
| Conservatório de Música de Coimbra (`conservatoriomcoimbra.pt`) | A WordPress blog whose "Eventos" category is stale (last post from April 2025) — would produce outdated data, not a live agenda. |
| Praxis / Praxis Beer Fest (`praxisbeerfest.pt`) | The page for a single annual festival (with an associated museum and restaurant), not a recurring agenda with multiple events — scraping it would yield at most one entry, disproportionate effort. |
| CAE — Centro de Artes e Espectáculos (`cae.pt`) | Its own "Programação" page loads the event list in a way that never shows up in the returned HTML (neither via a plain `fetch()`, nor in the DOM after load) — it seems to require further interaction. Already covered robustly via ViralAgenda (`/pt/coimbra/figueira-da-foz`) and via BOL. |
| BOL by venue subdomain (e.g. `tagv.bol.pt`) | An old ASP.NET WebForms app: the show list is built via postback/UpdatePanel, with no JSON API available — replicating that would mean simulating `__VIEWSTATE` tokens on every request (very fragile) or using a real browser. The main `bol.pt` site doesn't have this problem (see [Data sources](#data-sources)) and is included for that reason. |

### Note on ViralAgenda slugs and the Pombal concerts page

Unlike most locations on ViralAgenda, a few slugs don't follow the
"name-with-hyphens" pattern: Condeixa-a-Nova is `condeixaanova` and
Montemor-o-Velho is `montemorovelho` — both with the hyphens dropped
entirely (`condeixa-a-nova` and `montemor-o-velho` return 404). These were
only found by checking each URL individually; that's why the slugs in
[`providers/viral-agenda.js`](providers/viral-agenda.js) were confirmed one
by one instead of generated from the name.

Pombal is also scraped twice: its general page
(`/pt/leiria/pombal`) only shows the 20 soonest events across every
category, so a municipality with a lot of concerts specifically can have
some silently pushed off that page. `/pt/leiria/pombal/concerts` is the
same site's category-filtered view, with its own top-20 window — scraping
both surfaces events the general page alone would miss. Both sources
report events under the same `location: "Pombal"`, and any genuine overlap
between the two pages is still deduplicated (by title + day) like any
other pair of sources.

### Note on cm-soure's free-text dates

Unlike every other source here, cm-soure.pt doesn't publish the event date
as a structured field — each post's date lives inside ordinary Portuguese
prose in the article body (e.g. "Nos dias 12 e 13 de setembro de 2026, a
Ribeira da Mata recebe..."). [`providers/cm-soure.js`](providers/cm-soure.js)
extracts it with a "DD de \<mês\> [de YYYY]" pattern and picks the first day
of a range (so "dias 4, 5 e 6 de setembro" resolves to the 4th, the actual
start), but it's conservative on purpose: when no such pattern is found in
a post, that post is silently skipped rather than falling back to the
post's own publish date (which is when the announcement was written, not
when the event happens) or inventing a date the text doesn't give. A
missing year defaults to the post's publish year; a missing time defaults
to midnight — both documented placeholders, never guesses dressed up as
data.

The site also splits its content across two blog categories that both
matter: `/category/eventos/` (smaller/recurring community activities) and
`/category/agenda/` (bigger "official" entries — this is where the town's
main annual festival, "Festas de São Mateus", actually lives, not under
"Eventos"). Both are scraped as separate sources.

### Categories

Rather than a fixed list of categories, each source publishes its own
taxonomy (e.g. "Teatro e Dança", "Cinema e Vídeo", "Mercados, Festas,
Feiras e Romarias", "Infantil"). We keep the category exactly as the
source publishes it — forcing it into a fixed list would distort real
data. The substring filter still works as expected (`teatro` matches
"Teatro e Dança").

## Common errors

| Situation | Message | Exit code |
|---|---|---|
| `-end` not provided | `-end is required.` + usage | 1 |
| `-end`/`-start` in a format other than `YYYY-MM-DD` | `-end "..." is not in YYYY-MM-DD format.` | 1 |
| Valid format but not a real calendar date (e.g. `2026-02-30`) | `"..." is not a valid calendar date` | 1 |
| `-end` before `-start` | `-end (...) must be on or after -start (...)` | 1 |
| `-format` other than `text`/`json` | `invalid -format "..." (expected one of: text, json)` | 1 |
| Unknown parameter | `unknown parameter "..."` + usage | 1 |
| Docker not installed / not on `PATH` | `Docker is not installed or not on the PATH.` | 1 |
| Docker installed but the daemon isn't responding | `the Docker daemon is not responding.` | 1 |
| `events.json` doesn't exist (step 1 never ran) | `events.json not found. Run the collection step first...` | 1 |
| A source failed during collection | visible warning at the top of the listing | 0 (partial collection, not a fatal error) |
| Filter with no matches | `No events found for the given criteria.` | 0 (not an error) |

## File layout

- **[`list-events.sh`](list-events.sh)** — Bash entry point: validates
  arguments and the Docker environment, then orchestrates the two steps.
- **[`collect-events.js`](collect-events.js)** — step 1: calls the
  providers, aggregates, deduplicates and writes `events.json`.
- **[`list-events.js`](list-events.js)** — step 2: reads `events.json`,
  filters and prints the results (and any source-failure warnings), as
  text or as JSON depending on `-format`.
- **[`lib/filter-events.js`](lib/filter-events.js)** — the date/location/type
  filtering rule used by `list-events.js`, shared out so it has a single
  source of truth.
- **[`providers/`](providers/)** — one file per data source; each exports
  `{ name, url, getEvents() }` (or, for ViralAgenda, a function returning a
  list of these, one per location).
- **[`providers/_utils.js`](providers/_utils.js)** — helpers shared by the
  providers that enrich events with description/participants:
  `mapWithLimit` (bounded concurrency for the detail-page requests),
  `cleanHtmlToText` and `splitDescriptionAndParticipants`.
- **`events.json`** — artifact generated by step 1 (not versioned, listed
  in `.gitignore`).

To add a new source: create a new file in `providers/` exporting the same
interface and register it in `collect-events.js`. The date/category/location
filtering logic in `list-events.js` doesn't need to change.

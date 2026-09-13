'use strict';

/**
 * Source: bol.pt (Bilheteira Online). The homepage ships preloaded with
 * dozens of <script type="application/ld+json"> blocks in the
 * schema.org/Event format (the same one Google uses for event SEO) —
 * structured data by design, no loose HTML parsing needed.
 *
 * BOL's own advanced search (filter by district/venue) is a JavaScript-
 * rendered app, so it's not reliable for plain scraping. Instead, we
 * always use the homepage (which already carries a good sample of real
 * nationwide events) and filter locally to the districts we care about.
 *
 * Known limitations (documented in the README):
 * - The "addressLocality" field in BOL's JSON-LD is the DISTRICT, not the
 *   exact municipality (e.g. events in Águeda or Santa Maria da Feira show
 *   up as "Aveiro").
 * - The JSON-LD doesn't include the event's category/genre.
 * - BOL's "performers" field is not the artists — it's almost always
 *   "com produção de <company>" ("produced by <company>", the production
 *   company). Using it as "participants" would be misleading, so this
 *   provider leaves it out; BOL has no reliable description or cast info.
 */

const NAME = 'bol.pt';
const PAGE_URL = 'https://www.bol.pt/';

// Districts covering the requested locations: Coimbra (Coimbra, Figueira
// da Foz, Soure, Condeixa-a-Nova), Leiria (Pombal) and Aveiro (Aveiro).
const TARGET_DISTRICTS = new Set(['Coimbra', 'Aveiro', 'Leiria']);

function extractJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Malformed or non-JSON block — skip it, don't abort the whole fetch.
    }
  }
  return blocks;
}

async function getEvents() {
  const response = await fetch(PAGE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${PAGE_URL}`);
  }

  const html = await response.text();
  const blocks = extractJsonLdBlocks(html);
  const events = [];

  for (const block of blocks) {
    if (block['@type'] !== 'Event') continue;

    const district = block.location?.address?.addressLocality;
    if (!district || !TARGET_DISTRICTS.has(district)) continue;

    const title = (block.name || '').trim();
    const dateTime = block.startDate;
    if (!title || !dateTime) continue;

    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) continue;

    events.push({
      title,
      category: 'Uncategorized',
      location: district,
      venue: block.location?.name || district,
      dateTime: date.toISOString(),
      source: NAME,
      url: block.offers?.url || block.url || PAGE_URL,
    });
  }

  return events;
}

module.exports = { name: NAME, url: PAGE_URL, getEvents };

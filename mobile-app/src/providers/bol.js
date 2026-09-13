/**
 * Source: bol.pt (Bilheteira Online). The homepage ships preloaded with
 * dozens of <script type="application/ld+json"> blocks in the
 * schema.org/Event format — structured data by design, no HTML parsing
 * library needed (just regex + JSON.parse, identical to the CLI version).
 *
 * Ported from the CLI's providers/bol.js — the only change is using React
 * Native's own fetch (no CORS restriction, see mobile-app/README.md)
 * instead of node-fetch. Same known limitations apply (see the CLI's
 * README): "addressLocality" is the district, not the exact municipality,
 * there's no category/genre, and "performers" is left out because it's
 * almost always the production company, not the cast.
 */

import { fetchWithTimeout } from '../lib/text-utils';

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

export const name = NAME;
export const url = PAGE_URL;

export async function getEvents() {
  const response = await fetchWithTimeout(PAGE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    },
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

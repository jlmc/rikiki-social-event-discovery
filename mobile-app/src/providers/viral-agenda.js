/**
 * Source: viralagenda.com — nationwide cultural agenda aggregator. The
 * per-location pages (/pt/<district>/<location>) are server-rendered and
 * each event (<li class="viral-event">) already carries structured
 * metadata in data-* attributes (data-date-start in ISO 8601).
 *
 * Ported from the CLI's providers/viral-agenda.js: same LOCATIONS list and
 * selectors, using `node-html-parser` instead of `cheerio` and React
 * Native's own fetch (no CORS restriction — see mobile-app/README.md)
 * instead of node-fetch.
 */

import { parse } from 'node-html-parser';
import { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants, fetchWithTimeout } from '../lib/text-utils';

const BASE_URL = 'https://www.viralagenda.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Confirmed manually during investigation of the CLI's version of this
// provider (URLs that return real listings, not a 404). Slugs don't
// always follow the same pattern — "condeixaanova" has no hyphens, unlike
// "figueira-da-foz", and "montemorovelho" drops the hyphens too. Covers
// all 17 municipalities of the Coimbra district, plus Pombal and Aveiro.
export const LOCATIONS = [
  { district: 'coimbra', slug: 'coimbra', name: 'Coimbra' },
  { district: 'coimbra', slug: 'arganil', name: 'Arganil' },
  { district: 'coimbra', slug: 'cantanhede', name: 'Cantanhede' },
  { district: 'coimbra', slug: 'condeixaanova', name: 'Condeixa-a-Nova' },
  { district: 'coimbra', slug: 'figueira-da-foz', name: 'Figueira da Foz' },
  { district: 'coimbra', slug: 'gois', name: 'Góis' },
  { district: 'coimbra', slug: 'lousa', name: 'Lousã' },
  { district: 'coimbra', slug: 'mira', name: 'Mira' },
  { district: 'coimbra', slug: 'miranda-do-corvo', name: 'Miranda do Corvo' },
  { district: 'coimbra', slug: 'montemorovelho', name: 'Montemor-o-Velho' },
  { district: 'coimbra', slug: 'oliveira-do-hospital', name: 'Oliveira do Hospital' },
  { district: 'coimbra', slug: 'pampilhosa-da-serra', name: 'Pampilhosa da Serra' },
  { district: 'coimbra', slug: 'penacova', name: 'Penacova' },
  { district: 'coimbra', slug: 'penela', name: 'Penela' },
  { district: 'coimbra', slug: 'soure', name: 'Soure' },
  { district: 'coimbra', slug: 'tabua', name: 'Tábua' },
  { district: 'coimbra', slug: 'vila-nova-de-poiares', name: 'Vila Nova de Poiares' },
  { district: 'leiria', slug: 'pombal', name: 'Pombal' },
  // The general Pombal listing only shows the 20 soonest events across all
  // categories, which silently drops concerts scheduled further out — the
  // category-specific page has its own top-20 window, surfacing events the
  // general page misses. Same location value ("Pombal"), separate source
  // label so it's traceable in the sources report; genuine overlaps are
  // still deduped downstream by title+day.
  { district: 'leiria', slug: 'pombal/concerts', name: 'Pombal', label: 'Pombal — Concertos' },
  { district: 'aveiro', slug: 'aveiro', name: 'Aveiro' },
];

function resolveUrl(path, fallback) {
  if (!path) return fallback;
  try {
    return new URL(path, BASE_URL).toString();
  } catch {
    return fallback;
  }
}

async function enrichEvent(event) {
  try {
    const response = await fetchWithTimeout(event.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return event;

    const html = await response.text();
    const root = parse(html);
    const descriptionHtml = root.querySelector('.viral-event-description pre')?.innerHTML;
    if (!descriptionHtml) return event;

    const { description, participants } = splitDescriptionAndParticipants(
      cleanHtmlToText(descriptionHtml)
    );
    return { ...event, description, participants };
  } catch {
    return event;
  }
}

async function getEventsForLocation({ district, slug, name, label }) {
  const pageUrl = `${BASE_URL}/pt/${district}/${slug}`;
  const response = await fetchWithTimeout(pageUrl, { headers: { 'User-Agent': USER_AGENT } });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${pageUrl}`);
  }

  const html = await response.text();
  const root = parse(html);
  const events = [];

  for (const card of root.querySelectorAll('li.viral-event')) {
    const title = card.querySelector('.viral-event-title')?.text.trim();
    const startDate = card.getAttribute('data-date-start');
    if (!title || !startDate) continue;

    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) continue;

    const venue = card.querySelector('a.viral-event-place span')?.text.trim();

    const category =
      card
        .querySelectorAll('.viral-event-box-cat a')
        .map((el) => el.text.trim())
        .filter(Boolean)
        .join(' / ') || 'Uncategorized';

    events.push({
      title,
      category,
      location: name,
      venue: venue || name,
      dateTime: date.toISOString(),
      source: `viralagenda.com (${label || name})`,
      url: resolveUrl(card.getAttribute('data-url'), pageUrl),
    });
  }

  return mapWithLimit(events, 4, enrichEvent);
}

// Each location is treated as an independent "source": if the request for
// one location fails, the others keep being processed normally.
export async function getSources() {
  return LOCATIONS.map((target) => ({
    name: `viralagenda.com (${target.label || target.name})`,
    url: `${BASE_URL}/pt/${target.district}/${target.slug}`,
    getEvents: () => getEventsForLocation(target),
  }));
}

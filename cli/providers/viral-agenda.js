'use strict';

/**
 * Source: viralagenda.com — nationwide cultural agenda aggregator. The
 * per-location pages (/pt/<district>/<location>) are server-rendered and
 * each event (<li class="viral-event">) already carries structured
 * metadata in data-* attributes (data-date-start in ISO 8601), which makes
 * scraping considerably more robust than relying on loose text.
 *
 * After building each listing, events are enriched with description and
 * participants by fetching each one's own detail page, where the full text
 * lives in a <pre> inside ".viral-event-description" — in some cases
 * (e.g. cinema listings) it even includes a "Com <actors>" ("With
 * <actors>") line.
 */

const cheerio = require('cheerio');
const { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants } = require('./_utils');

const BASE_URL = 'https://www.viralagenda.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Confirmed manually during investigation (URLs that return real listings,
// not a 404). Slugs don't always follow the same pattern —
// "condeixaanova" has no hyphens, unlike "figueira-da-foz", and
// "montemorovelho" drops the hyphens too — so they were confirmed one by
// one instead of generated from the name. Covers all 17 municipalities of
// the Coimbra district, plus Pombal and Aveiro.
const LOCATIONS = [
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

async function enrichEvent(event) {
  try {
    const response = await fetch(event.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return event;

    const html = await response.text();
    const $ = cheerio.load(html);
    const descriptionHtml = $('.viral-event-description pre').first().html();
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
  const url = `${BASE_URL}/pt/${district}/${slug}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events = [];

  $('li.viral-event').each((_, element) => {
    const $card = $(element);

    const title = $card.find('.viral-event-title').first().text().trim();
    const startDate = $card.attr('data-date-start');
    if (!title || !startDate) return;

    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) return;

    const venue = $card.find('a.viral-event-place span').first().text().trim();

    const category =
      $card
        .find('.viral-event-box-cat a')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .join(' / ') || 'Uncategorized';

    const path = $card.attr('data-url');

    events.push({
      title,
      category,
      location: name,
      venue: venue || name,
      dateTime: date.toISOString(),
      source: `viralagenda.com (${label || name})`,
      url: path ? new URL(path, BASE_URL).toString() : `${BASE_URL}/pt/${district}/${slug}`,
    });
  });

  return mapWithLimit(events, 4, enrichEvent);
}

// Each location is treated as an independent "source": if the request for
// one location fails, the others keep being processed normally.
async function getSources() {
  return LOCATIONS.map((target) => ({
    name: `viralagenda.com (${target.label || target.name})`,
    url: `${BASE_URL}/pt/${target.district}/${target.slug}`,
    getEvents: () => getEventsForLocation(target),
  }));
}

module.exports = { getSources, LOCATIONS };

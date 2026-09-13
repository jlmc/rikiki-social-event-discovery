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
// "condeixaanova" has no hyphens, unlike "figueira-da-foz" — so they were
// confirmed one by one instead of generated from the name.
const LOCATIONS = [
  { district: 'coimbra', slug: 'coimbra', name: 'Coimbra' },
  { district: 'coimbra', slug: 'figueira-da-foz', name: 'Figueira da Foz' },
  { district: 'coimbra', slug: 'soure', name: 'Soure' },
  { district: 'coimbra', slug: 'condeixaanova', name: 'Condeixa-a-Nova' },
  { district: 'leiria', slug: 'pombal', name: 'Pombal' },
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

async function getEventsForLocation({ district, slug, name }) {
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
      source: `viralagenda.com (${name})`,
      url: path ? new URL(path, BASE_URL).toString() : `${BASE_URL}/pt/${district}/${slug}`,
    });
  });

  return mapWithLimit(events, 4, enrichEvent);
}

// Each location is treated as an independent "source": if the request for
// one location fails, the others keep being processed normally.
async function getSources() {
  return LOCATIONS.map((target) => ({
    name: `viralagenda.com (${target.name})`,
    url: `${BASE_URL}/pt/${target.district}/${target.slug}`,
    getEvents: () => getEventsForLocation(target),
  }));
}

module.exports = { getSources, LOCATIONS };

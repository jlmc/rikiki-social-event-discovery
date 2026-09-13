'use strict';

/**
 * Source: coimbraconvento.pt — official site of the Convento São Francisco
 * (Coimbra Cultura e Congressos). Plain SSR page, no JavaScript needed:
 * each event is a <li class="bloco-agenda"> with category, title, date(s)
 * and time as literal text (e.g. "12 Setembro, 2026", "19h00").
 *
 * After building the listing, each event is enriched with description and
 * participants by fetching its own detail page, where the full text lives
 * inside a <div class="more_details"> (description + artistic credits +
 * practical info, all mixed together — hence the split logic in _utils.js).
 */

const cheerio = require('cheerio');
const { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants } = require('./_utils');

const NAME = 'coimbraconvento.pt';
const PAGE_URL = 'https://coimbraconvento.pt/pt/agenda/';
const LOCATION = 'Coimbra';
const BASE_VENUE = 'Convento São Francisco';

// Portuguese month names, as published by the source — must stay in
// Portuguese, this is a data-matching table, not UI text.
const MONTHS = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function extractStartDateTime(dateText, timeText, now) {
  const dateMatch = dateText.match(
    /(\d{1,2})\s+(Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s*,?\s*(\d{4})?/i
  );
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const monthIndex = MONTHS[dateMatch[2].toLowerCase()];
  const year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();

  const timeMatch = timeText.match(/(\d{1,2})h(\d{2})/i);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;

  const date = new Date(year, monthIndex, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function enrichEvent(event) {
  try {
    const response = await fetch(event.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return event;

    const html = await response.text();
    const $ = cheerio.load(html);
    const detailsHtml = $('.more_details').first().html();
    if (!detailsHtml) return event;

    const { description, participants } = splitDescriptionAndParticipants(
      cleanHtmlToText(detailsHtml)
    );
    return { ...event, description, participants };
  } catch {
    return event;
  }
}

async function getEvents() {
  const response = await fetch(PAGE_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${PAGE_URL}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const now = new Date();
  const events = [];

  $('li.bloco-agenda').each((_, element) => {
    const $card = $(element);

    const title = cleanText($card.find('h4 a').first().text());
    if (!title) return;

    const category = cleanText($card.find('h6').first().text()) || 'Uncategorized';
    const room = cleanText($card.find('h5').first().text());

    const dateText = $card.find('.date').first().text();
    const timeText = $card.find('.time').first().text();
    const startDateTime = extractStartDateTime(dateText, timeText, now);
    if (!startDateTime) return;

    const href = $card.find('h4 a').first().attr('href');

    events.push({
      title,
      category,
      location: LOCATION,
      venue: room ? `${BASE_VENUE} — ${room}` : BASE_VENUE,
      dateTime: startDateTime.toISOString(),
      source: NAME,
      url: href ? new URL(href, PAGE_URL).toString() : PAGE_URL,
    });
  });

  return mapWithLimit(events, 4, enrichEvent);
}

module.exports = { name: NAME, url: PAGE_URL, getEvents };

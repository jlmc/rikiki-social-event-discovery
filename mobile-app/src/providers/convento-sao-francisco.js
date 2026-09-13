/**
 * Source: coimbraconvento.pt — official site of the Convento São Francisco
 * (Coimbra Cultura e Congressos). Plain SSR page: each event is a
 * <li class="bloco-agenda"> with category, title, date(s) and time as
 * literal text (e.g. "12 Setembro, 2026", "19h00").
 *
 * Ported from the CLI's providers/convento-sao-francisco.js: same
 * selectors and date-extraction heuristics, using `node-html-parser`
 * instead of `cheerio` and React Native's own fetch (no CORS restriction —
 * see mobile-app/README.md) instead of node-fetch.
 */

import { parse } from 'node-html-parser';
import { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants, fetchWithTimeout } from '../lib/text-utils';

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

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractStartDateTime(dateText, timeText, now) {
  const dateMatch = (dateText || '').match(
    /(\d{1,2})\s+(Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s*,?\s*(\d{4})?/i
  );
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const monthIndex = MONTHS[dateMatch[2].toLowerCase()];
  const year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();

  const timeMatch = (timeText || '').match(/(\d{1,2})h(\d{2})/i);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;

  const date = new Date(year, monthIndex, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveUrl(href) {
  if (!href) return PAGE_URL;
  try {
    return new URL(href, PAGE_URL).toString();
  } catch {
    return PAGE_URL;
  }
}

async function enrichEvent(event) {
  try {
    const response = await fetchWithTimeout(event.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return event;

    const html = await response.text();
    const root = parse(html);
    const detailsHtml = root.querySelector('.more_details')?.innerHTML;
    if (!detailsHtml) return event;

    const { description, participants } = splitDescriptionAndParticipants(
      cleanHtmlToText(detailsHtml)
    );
    return { ...event, description, participants };
  } catch {
    return event;
  }
}

export const name = NAME;
export const url = PAGE_URL;

export async function getEvents() {
  const response = await fetchWithTimeout(PAGE_URL, { headers: { 'User-Agent': USER_AGENT } });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${PAGE_URL}`);
  }

  const html = await response.text();
  const root = parse(html);
  const now = new Date();
  const events = [];

  for (const card of root.querySelectorAll('li.bloco-agenda')) {
    const title = cleanText(card.querySelector('h4 a')?.text);
    if (!title) continue;

    const category = cleanText(card.querySelector('h6')?.text) || 'Uncategorized';
    const room = cleanText(card.querySelector('h5')?.text);

    const dateText = card.querySelector('.date')?.text;
    const timeText = card.querySelector('.time')?.text;
    const startDateTime = extractStartDateTime(dateText, timeText, now);
    if (!startDateTime) continue;

    events.push({
      title,
      category,
      location: LOCATION,
      venue: room ? `${BASE_VENUE} — ${room}` : BASE_VENUE,
      dateTime: startDateTime.toISOString(),
      source: NAME,
      url: resolveUrl(card.querySelector('h4 a')?.getAttribute('href')),
    });
  }

  return mapWithLimit(events, 4, enrichEvent);
}

/**
 * Source: cm-condeixa.pt — Condeixa-a-Nova Municipal Council's own site.
 * Plain SSR homepage: a `<section id="agenda">` widget lists upcoming
 * events directly on the homepage, each as a `<li id="evento-NNNN">` with
 * a title, a `<span class="data">` holding a structured "DD de <mês> [a
 * DD de <mês>]" date (day/month only, no year), and a truncated summary.
 * The event's own detail page has the untruncated description, fetched
 * here as best-effort enrichment.
 *
 * No year is ever given, so the current year is used (same reasoning as
 * convento-sao-francisco.js). No per-event category is exposed in the
 * markup, so every event gets a generic category — only location/venue/
 * title filtering applies here, not type (same limitation as BOL).
 *
 * Ported from the CLI's providers/cm-condeixa.js: same selectors and
 * date-extraction heuristics, using `node-html-parser` instead of
 * `cheerio` and React Native's own fetch (no CORS restriction — see
 * mobile-app/README.md) instead of node-fetch.
 */

import { parse } from 'node-html-parser';
import { mapWithLimit, cleanHtmlToText, fetchWithTimeout } from '../lib/text-utils';

const NAME = 'cm-condeixa.pt';
const PAGE_URL = 'https://cm-condeixa.pt/';
const LOCATION = 'Condeixa-a-Nova';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Portuguese month names, as published by the source — must stay in
// Portuguese, this is a data-matching table, not UI text.
const MONTHS = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

const DATE_REGEX =
  /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i;

function extractStartDate(dateText, now) {
  const match = (dateText || '').match(DATE_REGEX);
  if (!match) return null;

  const day = Number(match[1]);
  const monthIndex = MONTHS[match[2].toLowerCase()];
  const date = new Date(now.getFullYear(), monthIndex, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveUrl(href, fallback) {
  if (!href) return fallback;
  try {
    return new URL(href, PAGE_URL).toString();
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
    const detailsHtml = root.querySelector('.popup-body-text')?.innerHTML;
    const description = cleanHtmlToText(detailsHtml);
    return description ? { ...event, description } : event;
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

  for (const item of root.querySelectorAll("#agenda-wrapper li[id^='evento-']")) {
    const heading = item.querySelector('h4');
    if (!heading) continue;

    const dateText = (heading.querySelector('.data')?.text || '').replace(/\s+/g, ' ').trim();
    const fullHeadingText = heading.text.replace(/\s+/g, ' ').trim();
    const title = fullHeadingText.replace(dateText, '').trim();
    if (!title) continue;

    const startDate = extractStartDate(dateText, now);
    if (!startDate) continue;

    const href = item.querySelector('a.popup')?.getAttribute('href');
    const summary = cleanHtmlToText(item.querySelector('.resumo .inner')?.innerHTML);

    events.push({
      title,
      category: 'Eventos',
      location: LOCATION,
      venue: LOCATION,
      dateTime: startDate.toISOString(),
      source: NAME,
      url: resolveUrl(href, PAGE_URL),
      description: summary,
    });
  }

  return mapWithLimit(events, 4, enrichEvent);
}

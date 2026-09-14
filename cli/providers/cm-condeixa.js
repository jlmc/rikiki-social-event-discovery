'use strict';

/**
 * Source: cm-condeixa.pt — Condeixa-a-Nova Municipal Council's own site.
 * Plain SSR homepage (old jQuery/Bootstrap custom CMS, no framework, no
 * JavaScript needed for the data itself): a `<section id="agenda">`
 * widget lists upcoming events directly on the homepage, each as a
 * `<li id="evento-NNNN">` with a title, a `<span class="data">` holding a
 * structured "DD de <mês> [a DD de <mês>]" date (day/month only, no
 * year), and a truncated summary. The event's own detail page
 * (`autarquia/eventos/evento.php?id=NNNN`, a popup/modal fragment) has
 * the untruncated description, fetched here as best-effort enrichment —
 * same pattern as the other sources with a detail-page enrichment step.
 *
 * No year is ever given for the date, so the current year is used — safe
 * here since this homepage widget only ever shows near-term events (like
 * convento-sao-francisco.js's identical fallback for the same reason).
 * No per-event category is exposed in the markup (the "Filtro" dropdown
 * visible on the page filters client-side against data this fetch
 * doesn't have access to), so every event gets a generic category, same
 * as BOL's "Uncategorized" — only location/venue/title filtering applies
 * here, not type.
 */

const cheerio = require('cheerio');
const { mapWithLimit, cleanHtmlToText } = require('./_utils');

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

async function enrichEvent(event) {
  try {
    const response = await fetch(event.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return event;

    const html = await response.text();
    const $ = cheerio.load(html);
    const detailsHtml = $('.popup-body-text').first().html();
    const description = cleanHtmlToText(detailsHtml);
    return description ? { ...event, description } : event;
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

  $("#agenda-wrapper li[id^='evento-']").each((_, element) => {
    const $item = $(element);
    const $heading = $item.find('h4').first();
    const dateText = $heading.find('.data').first().text().replace(/\s+/g, ' ').trim();
    const fullHeadingText = $heading.text().replace(/\s+/g, ' ').trim();
    const title = fullHeadingText.replace(dateText, '').trim();
    if (!title) return;

    const startDate = extractStartDate(dateText, now);
    if (!startDate) return;

    const href = $item.find('a.popup').first().attr('href');
    const summary = cleanHtmlToText($item.find('.resumo .inner').first().html());

    events.push({
      title,
      category: 'Eventos',
      location: LOCATION,
      venue: LOCATION,
      dateTime: startDate.toISOString(),
      source: NAME,
      url: href ? new URL(href, PAGE_URL).toString() : PAGE_URL,
      description: summary,
    });
  });

  return mapWithLimit(events, 4, enrichEvent);
}

module.exports = { name: NAME, url: PAGE_URL, getEvents };

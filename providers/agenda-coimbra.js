'use strict';

/**
 * Source: agenda.coimbra.pt — official platform of the Coimbra City
 * Council + University of Coimbra. The homepage is server-rendered (SSR),
 * so a plain fetch() already returns the HTML with the event cards, no
 * need to run JavaScript in a browser.
 *
 * The HTML uses utility classes (Tailwind) with no semantic names, so date
 * extraction relies on STRUCTURE (1st child block = start date/time, 2nd =
 * end date/time) instead of trying to interpret the separator text between
 * them, which varies ("-" or "a" depending on the range).
 *
 * After building the listing, each event is enriched with description and
 * participants by fetching its own detail page (one extra HTTP request per
 * event, with a concurrency limit — see enrichEvent).
 */

const cheerio = require('cheerio');
const { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants } = require('./_utils');

const NAME = 'agenda.coimbra.pt';
const PAGE_URL = 'https://agenda.coimbra.pt/';
const LOCATION = 'Coimbra';

// Portuguese month abbreviations, as published by the source — must stay
// in Portuguese, this is a data-matching table, not UI text.
const MONTHS = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Some cards show the full address across several lines; we only want the
// 1st line (the venue name), before collapsing whitespace.
function firstCleanLine(text) {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return cleanText(firstLine);
}

function inferYear(day, monthIndex, explicitYear, now) {
  if (explicitYear) return explicitYear;
  const candidate = new Date(now.getFullYear(), monthIndex, day);
  const diffDays = (now - candidate) / (1000 * 60 * 60 * 24);
  // Dates "in the past" by more than ~2 months are probably next year
  // (agendas only ever show day/month, rarely the year, when it's the
  // current year).
  return diffDays > 60 ? now.getFullYear() + 1 : now.getFullYear();
}

function extractStartDateTime(blockText, now) {
  const dateMatch = blockText.match(
    /(\d{1,2})\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\w*\s*(\d{4})?/i
  );
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const monthIndex = MONTHS[dateMatch[2].toLowerCase()];
  const year = inferYear(day, monthIndex, dateMatch[3] ? Number(dateMatch[3]) : null, now);

  const timeMatch = blockText.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;

  const date = new Date(year, monthIndex, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// The main listing doesn't show description or participants — only each
// event's own detail page has them, embedded in <meta name="description">
// (with HTML inside the attribute value itself). Failing to fetch ONE
// event's detail page shouldn't take down the rest: it's just left without
// description/participants.
async function enrichEvent(event) {
  try {
    const response = await fetch(event.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return event;

    const html = await response.text();
    const $ = cheerio.load(html);
    const metaDescription = $('meta[name="description"]').attr('content');
    if (!metaDescription) return event;

    const { description, participants } = splitDescriptionAndParticipants(
      cleanHtmlToText(metaDescription)
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

  $('a[href^="/event/"]').each((_, element) => {
    const $card = $(element);

    const title = cleanText($card.find('.condensed-text.font-semibold').first().text());
    if (!title) return;

    const venue = firstCleanLine(
      $card.find('.line-clamp-1.text-ellipsis.flex-1.text-xs').first().text()
    );

    const category = $card
      .find('.semicondensed-text.uppercase')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(' / ') || 'Uncategorized';

    // Structure: div.text-lg.border-l-2 > [start block][separator][end block]
    const dateBlock = $card.find('.text-lg.border-l-2').first();
    const firstBlock = dateBlock.children('div').first();
    const startText = (firstBlock.length ? firstBlock : dateBlock).text().trim();
    const startDateTime = extractStartDateTime(startText, now);
    if (!startDateTime) return;

    const href = $card.attr('href');

    events.push({
      title,
      category,
      location: LOCATION,
      venue: venue || 'Coimbra',
      dateTime: startDateTime.toISOString(),
      source: NAME,
      url: href ? new URL(href, PAGE_URL).toString() : PAGE_URL,
    });
  });

  return mapWithLimit(events, 4, enrichEvent);
}

module.exports = { name: NAME, url: PAGE_URL, getEvents };

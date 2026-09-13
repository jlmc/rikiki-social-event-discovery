/**
 * Source: agenda.coimbra.pt — official platform of the Coimbra City
 * Council + University of Coimbra. The homepage is server-rendered (SSR),
 * so a plain fetch() already returns the HTML with the event cards.
 *
 * Ported from the CLI's providers/agenda-coimbra.js: same selectors and
 * date-extraction heuristics, but using `node-html-parser` instead of
 * `cheerio` (confirmed to produce identical results against the real page —
 * see mobile-app/README.md) since there is no Node runtime here, and
 * plain fetch() instead of node-fetch, since React Native's own fetch
 * already bypasses the browser's CORS restriction (see README).
 */

import { parse } from 'node-html-parser';
import { mapWithLimit, cleanHtmlToText, splitDescriptionAndParticipants, fetchWithTimeout } from '../lib/text-utils';

const NAME = 'agenda.coimbra.pt';
const PAGE_URL = 'https://agenda.coimbra.pt/';
const LOCATION = 'Coimbra';

// Portuguese month abbreviations, as published by the source — must stay
// in Portuguese, this is a data-matching table, not UI text.
const MONTHS = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// Some cards show the full address across several lines; we only want the
// 1st line (the venue name), before collapsing whitespace.
function firstCleanLine(text) {
  const firstLine = (text || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return cleanText(firstLine);
}

// node-html-parser has no cheerio-style `.children('div')` helper — walk
// childNodes and keep the first element node (nodeType === 1).
function firstChildElement(el) {
  return (el?.childNodes || []).find((n) => n.nodeType === 1) || null;
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

function resolveUrl(href) {
  if (!href) return PAGE_URL;
  try {
    return new URL(href, PAGE_URL).toString();
  } catch {
    return PAGE_URL;
  }
}

// The main listing doesn't show description or participants — only each
// event's own detail page has them, embedded in <meta name="description">
// (with HTML inside the attribute value itself). Failing to fetch ONE
// event's detail page shouldn't take down the rest: it's just left without
// description/participants.
async function enrichEvent(event) {
  try {
    const response = await fetchWithTimeout(event.url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return event;

    const html = await response.text();
    const root = parse(html);
    const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute('content');
    if (!metaDescription) return event;

    const { description, participants } = splitDescriptionAndParticipants(
      cleanHtmlToText(metaDescription)
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

  for (const card of root.querySelectorAll('a[href^="/event/"]')) {
    const title = cleanText(card.querySelector('.condensed-text.font-semibold')?.text);
    if (!title) continue;

    const venue = firstCleanLine(card.querySelector('.line-clamp-1.text-ellipsis.flex-1.text-xs')?.text);

    const category =
      card
        .querySelectorAll('.semicondensed-text.uppercase')
        .map((el) => el.text.trim())
        .filter(Boolean)
        .join(' / ') || 'Uncategorized';

    // Structure: div.text-lg.border-l-2 > [start block][separator][end block]
    const dateBlock = card.querySelector('.text-lg.border-l-2');
    const firstBlock = dateBlock ? firstChildElement(dateBlock) : null;
    const startText = (firstBlock || dateBlock)?.text.trim();
    const startDateTime = startText ? extractStartDateTime(startText, now) : null;
    if (!startDateTime) continue;

    events.push({
      title,
      category,
      location: LOCATION,
      venue: venue || 'Coimbra',
      dateTime: startDateTime.toISOString(),
      source: NAME,
      url: resolveUrl(card.getAttribute('href')),
    });
  }

  return mapWithLimit(events, 4, enrichEvent);
}

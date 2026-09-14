'use strict';

/**
 * Source: cm-soure.pt — Soure Municipal Council's own site. Plain SSR
 * pages (WordPress + Elementor), no JavaScript needed, but unlike the
 * other sources here the event date isn't a structured field: it's
 * embedded in free-flowing Portuguese prose in each post's body (e.g.
 * "Nos dias 12 e 13 de setembro de 2026, a Ribeira da Mata recebe...").
 * This provider is deliberately conservative: it only publishes an event
 * when it can extract a "DD de <mês> [de YYYY]" date from the text with
 * reasonable confidence, and silently skips posts where it can't — it
 * never falls back to the post's publish date (that's when the
 * announcement was written, not when the event happens) and never
 * invents a date the text doesn't give.
 *
 * The site splits its content across two separate blog categories that
 * both matter here — discovered by cross-checking a real, expected event
 * ("Festas de São Mateus", the town's main annual festival) that turned
 * out to live under "Agenda", not "Eventos":
 *   - /category/eventos/  — smaller/recurring community activities
 *     (sports tournaments, library sessions, local parish festivities).
 *   - /category/agenda/   — the bigger, more "official" cultural agenda
 *     entries (town festivals, monthly activity round-ups).
 * Each is scraped and reported as its own source, so one category
 * failing doesn't hide the other.
 *
 * When the article gives no year for the date (common — "no dia 12 de
 * setembro" without "de 2026"), the year of the post's own
 * article:published_time is used, since these are near-term announcements
 * that essentially never span a year boundary. Time ("16h00", "15h30") is
 * looked for right after the date mention; when none is found the event
 * gets midnight as a known placeholder, not a guess.
 */

const cheerio = require('cheerio');
const { mapWithLimit, cleanHtmlToText } = require('./_utils');

const BASE_URL = 'https://cm-soure.pt';
const LOCATION = 'Soure';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const CATEGORIES = [
  { slug: 'eventos', label: 'Eventos' },
  { slug: 'agenda', label: 'Agenda' },
];

// Portuguese month names, as they appear in the source's own prose — must
// stay in Portuguese, this is a data-matching table, not UI text.
const MONTHS = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

// The leading `(?:\s*(?:e|a|,|-)\s*\d{1,2})*` swallows a second (or third)
// day number in a range before "de <mês>" (e.g. "dias 12 e 13 de
// setembro", "de 17 a 22 de setembro") so group 1 always ends up being the
// FIRST day mentioned — the range's start, not its end.
const DATE_REGEX =
  /(\d{1,2})(?:\s*(?:e|a|,|-)\s*\d{1,2})*\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/i;
const TIME_REGEX = /(\d{1,2})h(\d{2})?/i;

function extractStartDateTime(text, fallbackYear) {
  const dateMatch = text.match(DATE_REGEX);
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const monthIndex = MONTHS[dateMatch[2].toLowerCase()];
  const year = dateMatch[3] ? Number(dateMatch[3]) : fallbackYear;

  // Look for a time only from the date mention onwards, so a stray "Xh"
  // earlier in the text (a different date's time, in a post that mentions
  // more than one) doesn't get attached to the wrong date.
  const timeMatch = text.slice(dateMatch.index).match(TIME_REGEX);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0;

  const date = new Date(year, monthIndex, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Returns `undefined` when the fetch itself failed (network error, bad
// HTTP status) — distinct from a `null` return, which means the fetch
// worked fine but this particular post has no extractable date (the
// expected, non-error outcome of the conservative parsing this provider
// does). getEventsForCategory uses that distinction to tell "this
// specific post has no date" apart from "the site looks down" — a whole
// category returning nothing but `undefined`s means every request failed,
// which points at a broken/overloaded server, not an empty agenda.
async function fetchEvent({ title, url, label }) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;

  const html = await response.text();
  const $ = cheerio.load(html);

  const publishedMatch = html.match(/article:published_time"\s+content="(\d{4})-/);
  const fallbackYear = publishedMatch ? Number(publishedMatch[1]) : new Date().getFullYear();

  const contentHtml = $('.elementor-widget-theme-post-content .elementor-widget-container')
    .first()
    .html();
  const text = cleanHtmlToText(contentHtml);
  if (!text) return null;

  const startDateTime = extractStartDateTime(text, fallbackYear);
  if (!startDateTime) return null;

  return {
    title,
    category: 'Eventos',
    location: LOCATION,
    venue: LOCATION,
    dateTime: startDateTime.toISOString(),
    source: `cm-soure.pt (${label})`,
    url,
    description: text,
  };
}

async function getEventsForCategory(pageUrl, label) {
  const response = await fetch(pageUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${pageUrl}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const posts = [];

  $('article.elementor-post').each((_, element) => {
    const $article = $(element);
    const link = $article.find('.elementor-post__title a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const href = link.attr('href');
    if (!title || !href) return;

    posts.push({ title, url: new URL(href, pageUrl).toString(), label });
  });

  // Lower concurrency than the other providers (4) — this is a small
  // municipal server, observed to become unresponsive (whole-domain 503,
  // "capacity problems") under moderate concurrent load during testing.
  const results = await mapWithLimit(posts, 2, fetchEvent);

  // Every detail-page fetch failing outright (not "no date found", but
  // the request itself failing) means the site is likely down/overloaded
  // right now — surface that as a real failure instead of silently
  // reporting an empty (but "ok") category, which would look like "no
  // events today" instead of "couldn't reach the site".
  if (posts.length > 0 && results.every((r) => r === undefined)) {
    throw new Error(`all ${posts.length} detail-page fetches failed for ${pageUrl}`);
  }

  return results.filter(Boolean);
}

// Each category is its own independent "source": a failure fetching one
// (e.g. the site restructures /category/agenda/) never hides events from
// the other.
async function getSources() {
  return CATEGORIES.map(({ slug, label }) => {
    const pageUrl = `${BASE_URL}/category/${slug}/`;
    return {
      name: `cm-soure.pt (${label})`,
      url: pageUrl,
      getEvents: () => getEventsForCategory(pageUrl, label),
    };
  });
}

module.exports = { getSources };

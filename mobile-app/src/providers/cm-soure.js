/**
 * Source: cm-soure.pt — Soure Municipal Council's own site. Plain SSR
 * pages, no JavaScript needed, but unlike the other sources here the
 * event date isn't a structured field: it's embedded in free-flowing
 * Portuguese prose in each post's body (e.g. "Nos dias 12 e 13 de
 * setembro de 2026, a Ribeira da Mata recebe..."). This provider is
 * deliberately conservative: it only publishes an event when it can
 * extract a "DD de <mês> [de YYYY]" date from the text with reasonable
 * confidence, and silently skips posts where it can't.
 *
 * The site splits its content across two blog categories that both
 * matter — /category/eventos/ (smaller/recurring community activities)
 * and /category/agenda/ (bigger "official" entries, including the town's
 * main annual festival) — each scraped as its own source.
 *
 * Ported from the CLI's providers/cm-soure.js: same regex-based date
 * extraction, using `node-html-parser` instead of `cheerio` and React
 * Native's own fetch (no CORS restriction — see mobile-app/README.md)
 * instead of node-fetch.
 */

import { parse } from 'node-html-parser';
import { mapWithLimit, cleanHtmlToText, fetchWithTimeout } from '../lib/text-utils';

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

  const timeMatch = text.slice(dateMatch.index).match(TIME_REGEX);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0;

  const date = new Date(year, monthIndex, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveUrl(href, fallback) {
  if (!href) return fallback;
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return fallback;
  }
}

// Returns `undefined` when the fetch itself failed — distinct from
// `null`, which means the fetch worked but this post has no extractable
// date (the expected, non-error outcome of the conservative parsing this
// provider does). getEventsForCategory uses that distinction to tell
// "this post has no date" apart from "the site looks down".
async function fetchEvent({ title, url, label }) {
  let response;
  try {
    response = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;

  const html = await response.text();
  const root = parse(html);

  const publishedMatch = html.match(/article:published_time"\s+content="(\d{4})-/);
  const fallbackYear = publishedMatch ? Number(publishedMatch[1]) : new Date().getFullYear();

  const contentHtml = root.querySelector(
    '.elementor-widget-theme-post-content .elementor-widget-container'
  )?.innerHTML;
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
  const response = await fetchWithTimeout(pageUrl, { headers: { 'User-Agent': USER_AGENT } });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${pageUrl}`);
  }

  const html = await response.text();
  const root = parse(html);
  const posts = [];

  for (const article of root.querySelectorAll('article.elementor-post')) {
    const link = article.querySelector('.elementor-post__title a');
    const title = (link?.text || '').replace(/\s+/g, ' ').trim();
    const href = link?.getAttribute('href');
    if (!title || !href) continue;

    posts.push({ title, url: resolveUrl(href, pageUrl), label });
  }

  // Lower concurrency than the other providers (4) — this is a small
  // municipal server, observed to become unresponsive (whole-domain 503,
  // "capacity problems") under moderate concurrent load during testing.
  const results = await mapWithLimit(posts, 2, fetchEvent);

  // Every detail-page fetch failing outright means the site is likely
  // down/overloaded right now — surface that as a real failure instead of
  // silently reporting an empty (but "ok") category.
  if (posts.length > 0 && results.every((r) => r === undefined)) {
    throw new Error(`all ${posts.length} detail-page fetches failed for ${pageUrl}`);
  }

  return results.filter(Boolean);
}

// Each category is its own independent "source": a failure fetching one
// never hides events from the other.
export async function getSources() {
  return CATEGORIES.map(({ slug, label }) => {
    const pageUrl = `${BASE_URL}/category/${slug}/`;
    return {
      name: `cm-soure.pt (${label})`,
      url: pageUrl,
      getEvents: () => getEventsForCategory(pageUrl, label),
    };
  });
}

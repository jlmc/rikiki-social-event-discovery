#!/usr/bin/env node
'use strict';

/**
 * Step 2 of the pipeline: reads events.json (produced by collect-events.js)
 * and lists events between a start and an end date, with optional filters
 * by location and by event type (category).
 *
 * Runs inside a container WITHOUT network access — it only reads the JSON
 * file already mounted on the volume.
 *
 * Usage:
 *   node list-events.js -end <date> [-start <date>] [-location <text>] [-type <text>]
 *   node list-events.js -location help
 */

const fs = require('fs');
const path = require('path');
const { LOCATIONS } = require('./providers/viral-agenda');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EVENTS_FILE = path.join(__dirname, 'events.json');

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function printUsage() {
  console.log('Usage: list-events.js -end <YYYY-MM-DD> [-start <YYYY-MM-DD>] [-location <text>] [-type <text>]');
  console.log('       list-events.js -location help');
  console.log('-type matches each source\'s own (Portuguese) category text, e.g. "teatro", "concertos".');
}

function parseArgs(argv) {
  const args = { start: null, end: null, location: null, type: null };
  const knownFlags = { '-start': 'start', '-end': 'end', '-location': 'location', '-type': 'type' };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const field = knownFlags[flag];
    if (!field) fail(`unknown parameter "${flag}"`);

    const value = argv[i + 1];
    if (value === undefined) fail(`parameter "${flag}" needs a value`);

    args[field] = value;
    i++;
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

// -location help works standalone: it doesn't need -end, events.json, or
// network access — it just lists the locations we know how to filter by.
if (args.location && args.location.toLowerCase() === 'help') {
  console.log('Known values for -location (case-insensitive, partial match):');
  for (const { name } of LOCATIONS) {
    console.log(`  - ${name}`);
  }
  console.log('');
  console.log('Other nearby places may still show up opportunistically (e.g. from');
  console.log('bol.pt, which only reports at district level), but these are the');
  console.log('locations this tool actively collects events for.');
  process.exit(0);
}

if (!args.end || !DATE_REGEX.test(args.end)) {
  printUsage();
  fail(`missing or invalid -end date: "${args.end ?? ''}" (expected format: YYYY-MM-DD, e.g. 2026-12-31)`);
}

if (args.start && !DATE_REGEX.test(args.start)) {
  printUsage();
  fail(`invalid -start date: "${args.start}" (expected format: YYYY-MM-DD)`);
}

const now = new Date();
const startDateTime = args.start ? new Date(`${args.start}T00:00:00`) : now;
const endDateTime = new Date(`${args.end}T23:59:59`);

if (Number.isNaN(startDateTime.getTime())) {
  fail(`"${args.start}" is not a valid calendar date`);
}
if (Number.isNaN(endDateTime.getTime())) {
  fail(`"${args.end}" is not a valid calendar date`);
}
if (endDateTime < startDateTime) {
  fail(`-end (${args.end}) must be on or after -start (${args.start ?? now.toISOString().slice(0, 10)})`);
}

if (!fs.existsSync(EVENTS_FILE)) {
  fail('events.json not found. Run the collection step first ("node collect-events.js", with network access) before listing events.');
}

let data;
try {
  data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
} catch (error) {
  fail(`events.json is not valid JSON: ${error.message}`);
}

const locationFilter = (args.location || '').trim().toLowerCase();
const typeFilter = (args.type || '').trim().toLowerCase();

function withinDateRange(event) {
  const eventDate = new Date(event.dateTime);
  return eventDate >= startDateTime && eventDate <= endDateTime;
}

function matchesLocation(event) {
  if (!locationFilter) return true;
  return (event.location || '').toLowerCase().includes(locationFilter);
}

function matchesType(event) {
  if (!typeFilter) return true;
  return (event.category || '').toLowerCase().includes(typeFilter);
}

const results = (data.events || [])
  .filter(withinDateRange)
  .filter(matchesLocation)
  .filter(matchesType)
  .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

// ---------------------------------------------------------------------------
// Warnings: a broken source should never go unnoticed.
// ---------------------------------------------------------------------------
const failedSources = (data.sources || []).filter((s) => !s.ok);
if (failedSources.length > 0) {
  console.warn('!'.repeat(78));
  console.warn(`WARNING: ${failedSources.length} source(s) failed during the last collection run:`);
  for (const source of failedSources) {
    console.warn(`  - ${source.name}: ${source.error}`);
  }
  console.warn('The results below may be incomplete.');
  console.warn('!'.repeat(78));
  console.warn('');
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const MAX_DESCRIPTION_LENGTH = 320;

// Some sources prefix the actual synopsis with a short standalone label
// line (e.g. "Sinopse"). Skip lines like that so the summary shows the
// actual text instead of just the label.
function summarizeDescription(description) {
  const paragraphs = (description || '').split('\n').filter(Boolean);
  const firstParagraph = paragraphs.find((p) => p.length > 20) || paragraphs[0] || '';
  if (firstParagraph.length <= MAX_DESCRIPTION_LENGTH) return firstParagraph;
  return `${firstParagraph.slice(0, MAX_DESCRIPTION_LENGTH).trim()}…`;
}

console.log('='.repeat(78));
console.log(
  `Cultural and family events: ${startDateTime.toISOString().slice(0, 10)} -> ${args.end}` +
    (locationFilter ? `  (location: "${locationFilter}")` : '') +
    (typeFilter ? `  (type: "${typeFilter}")` : '') +
    `  [data from ${data.generatedAt}]`
);
console.log('='.repeat(78));

if (results.length === 0) {
  console.log('\nNo events found for the given criteria.');
} else {
  for (const event of results) {
    const formattedDate = dateFormatter.format(new Date(event.dateTime));
    console.log(`\n[${formattedDate}] ${event.category} — ${event.location} / ${event.venue}`);
    console.log(`  ${event.title}`);
    if (event.description) {
      console.log(`  ${summarizeDescription(event.description)}`);
    }
    if (event.participants && event.participants.length > 0) {
      console.log(`  participants: ${event.participants.join(', ')}`);
    }
    console.log(`  source: ${event.source}${event.url ? ` (${event.url})` : ''}`);
  }
}

console.log('\n' + '-'.repeat(78));
console.log(`Total: ${results.length} event(s) found.`);

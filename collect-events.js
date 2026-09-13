#!/usr/bin/env node
'use strict';

/**
 * Step 1 of the pipeline: goes through every configured real source,
 * aggregates the events found and writes everything to events.json.
 *
 * Runs inside a container WITH network access (unlike the presentation
 * step, list-events.js). Each source is isolated in a try/catch: a broken
 * source is recorded in "sources" with ok:false and a readable error, but
 * never stops the other sources from being processed.
 */

const fs = require('fs');
const path = require('path');

const agendaCoimbra = require('./providers/agenda-coimbra');
const viralAgenda = require('./providers/viral-agenda');
const conventoSaoFrancisco = require('./providers/convento-sao-francisco');
const bol = require('./providers/bol');

const OUTPUT_FILE = path.join(__dirname, 'events.json');

function dedupeKey(event) {
  const isoDay = event.dateTime.slice(0, 10);
  return `${event.title.trim().toLowerCase()}|${isoDay}`;
}

// The more complete an event is (longer description, has participants),
// the more worth keeping it is when two sources describe the same event —
// instead of staying locked to the arbitrary order the sources ran in.
function completenessScore(event) {
  return (event.description || '').length + (event.participants || []).length * 50;
}

function dedupe(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = dedupeKey(event);
    const existing = byKey.get(key);
    if (!existing || completenessScore(event) > completenessScore(existing)) {
      byKey.set(key, event);
    }
  }
  return [...byKey.values()];
}

async function processSource(source, sourceResults, allEvents) {
  try {
    const events = await source.getEvents();
    sourceResults.push({ name: source.name, url: source.url, ok: true, eventCount: events.length });
    allEvents.push(...events);
  } catch (error) {
    sourceResults.push({
      name: source.name,
      url: source.url,
      ok: false,
      error: error.message || String(error),
    });
  }
}

async function main() {
  const sourceResults = [];
  const allEvents = [];

  const viralAgendaSources = await viralAgenda.getSources();
  const sources = [
    { name: agendaCoimbra.name, url: agendaCoimbra.url, getEvents: agendaCoimbra.getEvents },
    {
      name: conventoSaoFrancisco.name,
      url: conventoSaoFrancisco.url,
      getEvents: conventoSaoFrancisco.getEvents,
    },
    { name: bol.name, url: bol.url, getEvents: bol.getEvents },
    ...viralAgendaSources,
  ];

  await Promise.all(sources.map((source) => processSource(source, sourceResults, allEvents)));

  const dedupedEvents = dedupe(allEvents).sort(
    (a, b) => new Date(a.dateTime) - new Date(b.dateTime)
  );
  const eventsWithIds = dedupedEvents.map((event, index) => ({ id: index + 1, ...event }));

  const output = {
    generatedAt: new Date().toISOString(),
    sources: sourceResults,
    events: eventsWithIds,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  const failedSources = sourceResults.filter((s) => !s.ok);
  console.log(
    `Collection finished: ${eventsWithIds.length} unique event(s) from ${sourceResults.length} source(s) ` +
      `(${sourceResults.length - failedSources.length} ok, ${failedSources.length} failed).`
  );
  for (const source of failedSources) {
    console.warn(`  WARNING: "${source.name}" failed: ${source.error}`);
  }
}

main().catch((error) => {
  console.error(`Fatal error while collecting events: ${error.message || error}`);
  process.exit(1);
});

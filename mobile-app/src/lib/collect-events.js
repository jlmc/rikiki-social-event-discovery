/**
 * Aggregation logic — ported from the CLI's collect-events.js, minus the
 * `fs.writeFileSync` step: here the result is only ever kept in memory
 * (component state / AsyncStorage), never written to a file, since this
 * runs on-device with no server and no disk artifact.
 */

import * as agendaCoimbra from '../providers/agenda-coimbra';
import * as viralAgenda from '../providers/viral-agenda';
import * as conventoSaoFrancisco from '../providers/convento-sao-francisco';
import * as bol from '../providers/bol';
import * as cmSoure from '../providers/cm-soure';

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

// Calls every provider, aggregates, deduplicates and sorts the result.
// Returns { generatedAt, sources, events } — never touches disk.
export async function collectEvents() {
  const sourceResults = [];
  const allEvents = [];

  const viralAgendaSources = await viralAgenda.getSources();
  const cmSoureSources = await cmSoure.getSources();
  const sources = [
    { name: agendaCoimbra.name, url: agendaCoimbra.url, getEvents: agendaCoimbra.getEvents },
    {
      name: conventoSaoFrancisco.name,
      url: conventoSaoFrancisco.url,
      getEvents: conventoSaoFrancisco.getEvents,
    },
    { name: bol.name, url: bol.url, getEvents: bol.getEvents },
    ...cmSoureSources,
    ...viralAgendaSources,
  ];

  await Promise.all(sources.map((source) => processSource(source, sourceResults, allEvents)));

  const dedupedEvents = dedupe(allEvents).sort(
    (a, b) => new Date(a.dateTime) - new Date(b.dateTime)
  );
  const eventsWithIds = dedupedEvents.map((event, index) => ({ id: index + 1, ...event }));

  return {
    generatedAt: new Date().toISOString(),
    sources: sourceResults,
    events: eventsWithIds,
  };
}
